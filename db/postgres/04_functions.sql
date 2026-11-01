-- DraftBoard Phase 2 functions and procedure.

CREATE OR REPLACE FUNCTION fn_match_prospects_for_team(p_team_id BIGINT)
RETURNS TABLE (
  prospect_id BIGINT,
  player_id BIGINT,
  f_name TEXT,
  l_name TEXT,
  "position" player_position,
  class_year SMALLINT,
  target_season SMALLINT,
  position_score NUMERIC,
  injury_penalty NUMERIC,
  measurement_bonus NUMERIC,
  match_score NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_season SMALLINT;
BEGIN
  SELECT r.season
  INTO v_target_season
  FROM roster r
  WHERE r.team_id = p_team_id
    AND r.is_historical = false
  ORDER BY r.season DESC
  LIMIT 1;

  IF v_target_season IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dp.prospect_id,
    p.player_id,
    p.f_name,
    p.l_name,
    p.position,
    dp.class_year,
    v_target_season,
    COALESCE(
      CASE
        WHEN need.position = p.position THEN need.priority * 20
        ELSE 0
      END,
      0
    )::NUMERIC AS position_score,
    (-20 * COUNT(DISTINCT ih.injury_id) FILTER (WHERE ih.severity = 'severe'))::NUMERIC
      AS injury_penalty,
    LEAST((COUNT(DISTINCT cm.measurement_id) * 2), 10)::NUMERIC
      AS measurement_bonus,
    (
      COALESCE(
        CASE
          WHEN need.position = p.position THEN need.priority * 20
          ELSE 0
        END,
        0
      )
      - (20 * COUNT(DISTINCT ih.injury_id) FILTER (WHERE ih.severity = 'severe'))
      + LEAST((COUNT(DISTINCT cm.measurement_id) * 2), 10)
    )::NUMERIC AS match_score
  FROM draft_prospect dp
  JOIN player p ON p.player_id = dp.player_id
  LEFT JOIN LATERAL (
    SELECT tn.position, tn.priority
    FROM team_need tn
    WHERE tn.team_id = p_team_id
      AND tn.is_filled = false
    ORDER BY tn.priority DESC, tn.need_id
    LIMIT 1
  ) need ON true
  LEFT JOIN injury_history ih ON ih.player_id = p.player_id
  LEFT JOIN combined_measurement cm ON cm.player_id = p.player_id
  WHERE p.position IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM roster_player rp
      WHERE rp.player_id = p.player_id
        AND rp.season = v_target_season
    )
  GROUP BY
    dp.prospect_id,
    p.player_id,
    p.f_name,
    p.l_name,
    p.position,
    dp.class_year,
    need.position,
    need.priority
  ORDER BY match_score DESC, dp.class_year DESC, p.l_name, p.f_name;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_draft_prospect_to_roster(
  p_prospect_id BIGINT,
  p_roster_id BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_id BIGINT;
  v_team_id BIGINT;
  v_season SMALLINT;
  v_position player_position;
BEGIN
  SELECT r.team_id, r.season
  INTO v_team_id, v_season
  FROM roster r
  WHERE r.roster_id = p_roster_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster % does not exist', p_roster_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT p.player_id, p.position
  INTO v_player_id, v_position
  FROM draft_prospect dp
  JOIN player p ON p.player_id = dp.player_id
  WHERE dp.prospect_id = p_prospect_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft prospect % does not exist', p_prospect_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  BEGIN
    INSERT INTO roster_player (roster_id, player_id, season)
    VALUES (p_roster_id, v_player_id, v_season);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Player % is already on a roster this season (%)', v_player_id, v_season
      USING ERRCODE = 'unique_violation';
  END;

  UPDATE team_need tn
  SET is_filled = true
  WHERE tn.need_id = (
    SELECT candidate.need_id
    FROM team_need candidate
    WHERE candidate.team_id = v_team_id
      AND candidate.position = v_position
      AND candidate.is_filled = false
    ORDER BY candidate.priority DESC, candidate.need_id
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_player_efficiency(p_player_id BIGINT)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    SUM(gp.points + gp.rebounds + gp.assists + gp.steals + gp.blocks)
      / NULLIF(SUM(gp.minutes), 0),
    0
  )::NUMERIC
  FROM game_performance gp
  WHERE gp.player_id = p_player_id;
$$;

-- Current NBA scouting workflow. Scores are transparent proxies, not a
-- prediction of player quality. The latest managed roster defines the season.
CREATE OR REPLACE FUNCTION fn_match_players_for_team(p_team_id BIGINT)
RETURNS TABLE (
  player_id BIGINT, f_name TEXT, l_name TEXT, "position" player_position,
  target_season SMALLINT, need_id BIGINT, need_priority SMALLINT,
  position_score NUMERIC, stats_score NUMERIC, measurement_bonus NUMERIC,
  match_score NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_season SMALLINT;
BEGIN
  SELECT r.season INTO v_season FROM roster r
  WHERE r.team_id = p_team_id AND NOT r.is_historical
  ORDER BY r.season DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT p.player_id, p.f_name, p.l_name, p.position, n.need_id, n.priority,
      (n.priority * 20)::numeric AS ps,
      COALESCE(LEAST(ROUND(AVG(gp.points + gp.rebounds + gp.assists + gp.steals + gp.blocks), 2), 50), 0)::numeric AS ss,
      LEAST(COUNT(DISTINCT cm.measurement_id) * 2, 10)::numeric AS mb
    FROM player p
    JOIN LATERAL (
      SELECT tn.need_id, tn.priority FROM team_need tn
      WHERE tn.team_id = p_team_id AND NOT tn.is_filled AND tn.position = p.position
      ORDER BY tn.priority DESC, tn.need_id LIMIT 1
    ) n ON true
    LEFT JOIN game_performance gp ON gp.player_id = p.player_id
    LEFT JOIN LATERAL (SELECT m.measurement_id FROM combined_measurement m WHERE m.player_id = p.player_id LIMIT 5) cm ON true
    WHERE p.position IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM roster_player rp WHERE rp.player_id = p.player_id AND rp.season = v_season
    )
    GROUP BY p.player_id, n.need_id, n.priority
    HAVING COUNT(DISTINCT gp.performance_id) >= 10
  )
  SELECT c.player_id, c.f_name, c.l_name, c.position, v_season,
         c.need_id, c.priority, c.ps, c.ss, c.mb, c.ps + c.ss + c.mb
  FROM candidates c ORDER BY c.ps + c.ss + c.mb DESC, c.player_id;
END;
$$;

-- Aggregate dashboard data without truncating results to API list pages.
CREATE OR REPLACE FUNCTION fn_dashboard(p_person_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE v_role person_role; v_team BIGINT; v_result JSONB;
BEGIN
  SELECT p.role, tm.team_id INTO v_role,v_team FROM person p LEFT JOIN team_manager tm ON tm.person_id=p.person_id WHERE p.person_id=p_person_id;
  IF v_role = 'admin' THEN
    SELECT jsonb_build_object('role',v_role,'counts',jsonb_build_object(
      'players',(SELECT count(*) FROM player),'teams',(SELECT count(*) FROM team),'reports',(SELECT count(*) FROM scouting_report),'open_needs',(SELECT count(*) FROM team_need WHERE NOT is_filled)),
      'recent_reports',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT r.report_id::text,r.player_id::text,r.report_date,r.summary,concat_ws(' ',p.f_name,p.l_name) AS player_name,CASE WHEN r.embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM scouting_report r JOIN player p USING(player_id) ORDER BY r.report_date DESC,r.report_id DESC LIMIT 5) x),
      'open_needs',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT n.need_id::text,t.team_name,n.position,n.priority,n.description FROM team_need n JOIN team t USING(team_id) WHERE NOT n.is_filled ORDER BY n.priority DESC,n.need_id LIMIT 8) x)) INTO v_result;
  ELSIF v_role = 'scout' THEN
    SELECT jsonb_build_object('role',v_role,'report_count',count(*),'pending_count',count(*) FILTER (WHERE r.embedding IS NULL),
      'reports',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT sr.report_id::text,sr.player_id::text,sr.report_date,sr.summary,concat_ws(' ',p.f_name,p.l_name) AS player_name,CASE WHEN sr.embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM scouting_report sr JOIN player p USING(player_id) WHERE sr.scout_id=p_person_id ORDER BY sr.report_date DESC,sr.report_id DESC LIMIT 8) x)) INTO v_result FROM scouting_report r WHERE r.scout_id=p_person_id;
  ELSIF v_role = 'analyst' THEN
    SELECT jsonb_build_object('role',v_role,
      'top_performers',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT p.player_id::text,concat_ws(' ',p.f_name,p.l_name) AS player_name,count(*)::int AS games,round(avg(gp.points),2) AS points FROM game_performance gp JOIN player p USING(player_id) GROUP BY p.player_id HAVING count(*)>=10 ORDER BY avg(gp.points) DESC,p.player_id LIMIT 5) x),
      'efficiency_leaders',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT p.player_id::text,concat_ws(' ',p.f_name,p.l_name) AS player_name,count(*)::int AS games,round(fn_player_efficiency(p.player_id),3) AS efficiency FROM game_performance gp JOIN player p USING(player_id) GROUP BY p.player_id HAVING count(*)>=10 AND sum(gp.minutes)>0 ORDER BY sum(gp.points+gp.rebounds+gp.assists+gp.steals+gp.blocks)/nullif(sum(gp.minutes),0) DESC,p.player_id LIMIT 5) x)) INTO v_result;
  ELSIF v_role = 'team_manager' THEN
    SELECT jsonb_build_object('role',v_role,'team_id',v_team::text,'team_name',(SELECT team_name FROM team WHERE team_id=v_team),
      'open_needs',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT need_id::text,position,priority,description FROM team_need WHERE team_id=v_team AND NOT is_filled ORDER BY priority DESC,need_id) x),
      'roster',(SELECT to_jsonb(x) FROM (SELECT r.roster_id::text,r.season,count(rp.player_id)::int AS size FROM roster r LEFT JOIN roster_player rp USING(roster_id) WHERE r.team_id=v_team AND NOT r.is_historical GROUP BY r.roster_id ORDER BY r.season DESC LIMIT 1) x),
      'matches',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT m.player_id::text,m.f_name,m.l_name,m.position,m.match_score,m.need_priority FROM fn_match_players_for_team(v_team) m ORDER BY m.match_score DESC,m.player_id LIMIT 5) x)) INTO v_result;
  END IF;
  RETURN v_result;
END;
$$;

-- Workspace views and mutations used by reports, games and team management.
CREATE OR REPLACE FUNCTION fn_workspace_persons()
RETURNS TABLE(person_id bigint,f_name text,l_name text,email text,role person_role)
LANGUAGE sql STABLE AS $$ SELECT p.person_id,p.f_name,p.l_name,p.email,p.role FROM person p ORDER BY p.l_name,p.f_name,p.person_id $$;
CREATE OR REPLACE FUNCTION fn_workspace_reports(p_limit integer,p_offset integer,p_scout_id bigint)
RETURNS TABLE(report_id bigint,player_id bigint,scout_id bigint,report_date date,summary text,embedding_status text)
LANGUAGE sql STABLE AS $$ SELECT r.report_id,r.player_id,r.scout_id,r.report_date,r.summary,CASE WHEN r.embedding IS NULL THEN 'pending' ELSE 'indexed' END FROM scouting_report r WHERE (p_scout_id IS NULL OR r.scout_id=p_scout_id) ORDER BY r.report_id DESC LIMIT p_limit OFFSET p_offset $$;
CREATE OR REPLACE FUNCTION fn_workspace_game_exists(p_game_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM game WHERE game_id=p_game_id) $$;
CREATE OR REPLACE FUNCTION fn_workspace_box_score(p_game_id bigint)
RETURNS TABLE(performance_id bigint,game_id bigint,player_id bigint,team_id bigint,minutes numeric,points numeric,rebounds numeric,assists numeric,blocks numeric,steals numeric,f_name text,l_name text,team_name text)
LANGUAGE sql STABLE AS $$ SELECT gp.performance_id,gp.game_id,gp.player_id,gp.team_id,gp.minutes,gp.points,gp.rebounds,gp.assists,gp.blocks,gp.steals,p.f_name,p.l_name,t.team_name FROM game_performance gp JOIN player p USING(player_id) JOIN team t USING(team_id) WHERE gp.game_id=p_game_id ORDER BY t.team_name,gp.minutes DESC,p.l_name,p.f_name $$;
CREATE OR REPLACE FUNCTION fn_workspace_update_need(p_team_id bigint,p_need_id bigint,p_position player_position,p_priority smallint,p_description text,p_is_filled boolean)
RETURNS SETOF team_need LANGUAGE sql AS $$ UPDATE team_need SET position=coalesce(p_position,position),priority=coalesce(p_priority,priority),description=coalesce(p_description,description),is_filled=coalesce(p_is_filled,is_filled) WHERE team_id=p_team_id AND need_id=p_need_id RETURNING * $$;
CREATE OR REPLACE FUNCTION fn_workspace_delete_need(p_team_id bigint,p_need_id bigint)
RETURNS SETOF team_need LANGUAGE sql AS $$ DELETE FROM team_need WHERE team_id=p_team_id AND need_id=p_need_id RETURNING * $$;

-- News feed filtering uses exact article mentions; semantic neighbours use the configured model.
CREATE OR REPLACE FUNCTION fn_news_feed(p_limit integer,p_offset integer,p_player_id bigint)
RETURNS TABLE(article_id bigint,title text,publish_date date,summary text,url text,embedding_status text)
LANGUAGE sql STABLE AS $$
 SELECT n.article_id,n.title,n.publish_date,n.summary,n.url,CASE WHEN n.embedding IS NULL THEN 'pending' ELSE 'indexed' END
 FROM news_article n WHERE p_player_id IS NULL OR EXISTS (SELECT 1 FROM article_mention am WHERE am.article_id=n.article_id AND am.player_id=p_player_id)
 ORDER BY n.publish_date DESC,n.article_id DESC LIMIT p_limit OFFSET p_offset
$$;
CREATE OR REPLACE FUNCTION fn_news_related(p_article_id bigint,p_model text,p_limit integer)
RETURNS TABLE(article_id bigint,title text,publish_date date,summary text,url text,embedding_status text,similarity double precision)
LANGUAGE sql STABLE AS $$
 SELECT n.article_id,n.title,n.publish_date,n.summary,n.url,CASE WHEN n.embedding IS NULL THEN 'pending' ELSE 'indexed' END,1-(n.embedding <=> source.embedding)
 FROM news_article source JOIN news_article n ON n.article_id<>source.article_id
 WHERE source.article_id=p_article_id AND source.embedding IS NOT NULL AND source.embedding_model=p_model AND n.embedding IS NOT NULL AND n.embedding_model=p_model
 ORDER BY n.embedding <=> source.embedding,n.article_id LIMIT p_limit
$$;

-- Fixed, read-only examples for the UI; no caller-supplied SQL is executed.
CREATE OR REPLACE FUNCTION fn_showcase_relational(p_example text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb;
BEGIN
 IF p_example='view_needs' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT need_id::text,team_id::text,team_name,position,priority,description FROM v_team_open_needs ORDER BY priority DESC,need_id LIMIT 50) x;
 ELSIF p_example='audit' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT audit_id::text,table_name,action,record_key,changed_by::text,changed_at FROM audit_log ORDER BY changed_at DESC,audit_id DESC LIMIT 50) x;
 ELSIF p_example='join' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT p.player_id::text,p.f_name,p.l_name,g.season,g.game_date,t.team_name,gp.minutes,gp.points,gp.rebounds,gp.assists FROM game_performance gp JOIN player p USING(player_id) JOIN game g USING(game_id) JOIN team t USING(team_id) WHERE g.external_id LIKE 'nba:%' ORDER BY g.game_date DESC,gp.points DESC,p.l_name,p.f_name LIMIT 20) x;
 ELSIF p_example='having' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT p.player_id::text,p.f_name,p.l_name,p.position,count(*) AS games,round(avg(gp.points),2) AS avg_points FROM player p JOIN game_performance gp USING(player_id) JOIN game g USING(game_id) WHERE g.external_id LIKE 'nba:%' GROUP BY p.player_id HAVING count(*)>=10 AND avg(gp.points)>=20 ORDER BY avg(gp.points) DESC,count(*) DESC,p.l_name,p.f_name) x;
 ELSIF p_example='top' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT p.player_id::text,p.f_name,p.l_name,p.position,count(*) AS games,round(avg(gp.points),2) AS avg_points FROM player p JOIN game_performance gp USING(player_id) JOIN game g USING(game_id) WHERE g.external_id LIKE 'nba:%' GROUP BY p.player_id HAVING count(*)>=10 ORDER BY avg(gp.points) DESC,count(*) DESC,p.l_name,p.f_name LIMIT 10) x;
 ELSIF p_example='correlated' THEN
   WITH averages AS (SELECT p.player_id,p.f_name,p.l_name,p.position,avg(gp.points) AS points FROM player p JOIN game_performance gp USING(player_id) JOIN game g USING(game_id) WHERE g.external_id LIKE 'nba:%' AND p.position IS NOT NULL GROUP BY p.player_id HAVING count(*)>=10)
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT a.player_id::text,a.f_name,a.l_name,a.position,round(a.points,2) AS avg_points FROM averages a WHERE a.points>(SELECT avg(b.points) FROM averages b WHERE b.position=a.position) ORDER BY a.position,a.points DESC LIMIT 50) x;
 ELSIF p_example='exists' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT p.player_id::text,p.f_name,p.l_name,p.position FROM player p WHERE EXISTS (SELECT 1 FROM scouting_report r WHERE r.player_id=p.player_id) AND EXISTS (SELECT 1 FROM game_performance gp JOIN game g USING(game_id) WHERE gp.player_id=p.player_id AND g.external_id LIKE 'nba:%') ORDER BY p.position NULLS LAST,p.l_name,p.f_name LIMIT 20) x;
 ELSIF p_example='ranking' THEN
   WITH averages AS (SELECT p.player_id,p.f_name,p.l_name,p.position,count(*) AS games,avg(gp.points) AS points FROM player p JOIN game_performance gp USING(player_id) JOIN game g USING(game_id) WHERE g.external_id LIKE 'nba:%' AND p.position IS NOT NULL GROUP BY p.player_id HAVING count(*)>=10), ranked AS (SELECT *,row_number() OVER(PARTITION BY position ORDER BY points DESC,games DESC,l_name,f_name) AS rank FROM averages)
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT position,rank,player_id::text,f_name,l_name,games,round(points,2) AS avg_points FROM ranked WHERE rank<=3 ORDER BY position,rank) x;
 ELSE RAISE EXCEPTION 'Unknown showcase example' USING ERRCODE='22023'; END IF;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION fn_showcase_vector_plan(p_mode text)
RETURNS SETOF text LANGUAGE plpgsql VOLATILE AS $$
DECLARE line text;
BEGIN
 IF p_mode='without_index' THEN PERFORM set_config('enable_indexscan','off',true); PERFORM set_config('enable_bitmapscan','off',true);
 ELSIF p_mode='index_available' THEN NULL;
 ELSIF p_mode='force_index' THEN PERFORM set_config('enable_seqscan','off',true);
 ELSE RAISE EXCEPTION 'Unknown plan mode' USING ERRCODE='22023'; END IF;
 FOR line IN EXECUTE 'EXPLAIN (ANALYZE, BUFFERS) SELECT sr.report_id, 1 - (sr.embedding <=> (SELECT anchor.embedding FROM scouting_report anchor WHERE anchor.embedding IS NOT NULL ORDER BY anchor.report_id LIMIT 1)) AS similarity FROM scouting_report sr WHERE sr.embedding IS NOT NULL ORDER BY sr.embedding <=> (SELECT anchor.embedding FROM scouting_report anchor WHERE anchor.embedding IS NOT NULL ORDER BY anchor.report_id LIMIT 1) LIMIT 5' LOOP RETURN NEXT line; END LOOP;
END;
$$;

-- A fixed rollback demonstration. The exception block rolls back every fixture write.
CREATE OR REPLACE FUNCTION fn_showcase_rollback()
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE team_a bigint; team_b bigint; player bigint; roster_a bigint; roster_b bigint; fixture_name text := 'UI rollback demo ' || txid_current()::text; rejected boolean := false; violated_constraint text;
BEGIN
 BEGIN
  INSERT INTO team(team_name,city) VALUES(fixture_name,'Demo') RETURNING team_id INTO team_a;
  INSERT INTO team(team_name,city) VALUES(fixture_name || ' B','Demo') RETURNING team_id INTO team_b;
  INSERT INTO player(f_name,l_name) VALUES('Rollback','Fixture') RETURNING player_id INTO player;
  INSERT INTO roster(team_id,season) VALUES(team_a,2200) RETURNING roster_id INTO roster_a;
  INSERT INTO roster(team_id,season) VALUES(team_b,2200) RETURNING roster_id INTO roster_b;
  INSERT INTO roster_player(roster_id,player_id,season) VALUES(roster_a,player,2200);
  INSERT INTO roster_player(roster_id,player_id,season) VALUES(roster_b,player,2200);
  RAISE EXCEPTION 'Expected duplicate membership to fail';
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
  IF violated_constraint <> 'uq_roster_player_player_season' THEN RAISE; END IF;
  rejected := true;
 END;
 RETURN jsonb_build_object('duplicate_rejected',rejected,'fixtures_rolled_back',NOT EXISTS(SELECT 1 FROM team WHERE team_name=fixture_name));
END;
$$;
