-- DraftBoard Phase 4 SQL showcase and Phase 2 acceptance demonstrations.
-- These statements are intentionally read-only until the explicit test
-- transaction below, which rolls back all of its fixtures.

-- View calls.
SELECT * FROM v_player_profile ORDER BY l_name, f_name LIMIT 10;
SELECT * FROM v_team_open_needs ORDER BY priority DESC, team_id LIMIT 10;
SELECT * FROM v_prospect_board ORDER BY class_year DESC, l_name, f_name LIMIT 10;

-- Function calls.
SELECT * FROM fn_match_prospects_for_team(
  (SELECT team_id FROM team ORDER BY team_id LIMIT 1)
);
SELECT fn_player_efficiency(
  (SELECT player_id FROM player ORDER BY player_id LIMIT 1)
);

-- Phase 4: relational query examples using the imported NBA sample.

-- 1. Multi-table JOIN: game-level player output with real team and game context.
SELECT
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  g.season,
  g.game_date,
  t.team_name,
  gp.minutes,
  gp.points,
  gp.rebounds,
  gp.assists
FROM game_performance gp
JOIN player p ON p.player_id = gp.player_id
JOIN game g ON g.game_id = gp.game_id
JOIN team t ON t.team_id = gp.team_id
WHERE g.external_id LIKE 'nba:%'
ORDER BY g.game_date DESC, gp.points DESC, p.l_name, p.f_name
LIMIT 20;

-- 2. GROUP BY + HAVING: players averaging at least 20 points over 10+ games.
SELECT
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  COUNT(*) AS games_played,
  ROUND(AVG(gp.points), 2) AS avg_points
FROM game_performance gp
JOIN game g ON g.game_id = gp.game_id
JOIN player p ON p.player_id = gp.player_id
WHERE g.external_id LIKE 'nba:%'
GROUP BY p.player_id, p.f_name, p.l_name, p.position
HAVING COUNT(*) >= 10 AND AVG(gp.points) >= 20
ORDER BY avg_points DESC, games_played DESC, p.l_name, p.f_name;

-- 3. ORDER BY + LIMIT: top 10 players by points per game in the imported sample.
SELECT
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  COUNT(*) AS games_played,
  ROUND(AVG(gp.points), 2) AS avg_points
FROM game_performance gp
JOIN game g ON g.game_id = gp.game_id
JOIN player p ON p.player_id = gp.player_id
WHERE g.external_id LIKE 'nba:%'
GROUP BY p.player_id, p.f_name, p.l_name, p.position
ORDER BY avg_points DESC, games_played DESC, p.l_name, p.f_name
LIMIT 10;

-- 4. Correlated subquery: players above their position's mean player average.
WITH player_averages AS (
  SELECT
    p.player_id,
    p.f_name,
    p.l_name,
    p.position,
    AVG(gp.points) AS avg_points
  FROM game_performance gp
  JOIN game g ON g.game_id = gp.game_id
  JOIN player p ON p.player_id = gp.player_id
  WHERE g.external_id LIKE 'nba:%'
    AND p.position IS NOT NULL
  GROUP BY p.player_id, p.f_name, p.l_name, p.position
  HAVING COUNT(*) >= 10
)
SELECT
  current_player.position,
  current_player.player_id,
  current_player.f_name,
  current_player.l_name,
  ROUND(current_player.avg_points, 2) AS avg_points
FROM player_averages current_player
WHERE current_player.avg_points > (
  SELECT AVG(peer.avg_points)
  FROM player_averages peer
  WHERE peer.position = current_player.position
)
ORDER BY current_player.position, current_player.avg_points DESC;

-- 5. EXISTS subquery: imported players with both a report and NBA appearances.
SELECT p.player_id, p.f_name, p.l_name, p.position
FROM player p
WHERE EXISTS (
  SELECT 1
  FROM scouting_report sr
  WHERE sr.player_id = p.player_id
)
AND EXISTS (
  SELECT 1
  FROM game_performance gp
  JOIN game g ON g.game_id = gp.game_id
  WHERE gp.player_id = p.player_id
    AND g.external_id LIKE 'nba:%'
)
ORDER BY p.position NULLS LAST, p.l_name, p.f_name
LIMIT 20;

-- 6. Window function: rank each player's points average within their position.
WITH player_averages AS (
  SELECT
    p.player_id,
    p.f_name,
    p.l_name,
    p.position,
    COUNT(*) AS games_played,
    AVG(gp.points) AS avg_points
  FROM game_performance gp
  JOIN game g ON g.game_id = gp.game_id
  JOIN player p ON p.player_id = gp.player_id
  WHERE g.external_id LIKE 'nba:%'
    AND p.position IS NOT NULL
  GROUP BY p.player_id, p.f_name, p.l_name, p.position
  HAVING COUNT(*) >= 10
), ranked_players AS (
  SELECT
    player_averages.*,
    ROW_NUMBER() OVER (
      PARTITION BY position
      ORDER BY avg_points DESC, games_played DESC, l_name, f_name
    ) AS position_rank
  FROM player_averages
)
SELECT
  position,
  position_rank,
  player_id,
  f_name,
  l_name,
  games_played,
  ROUND(avg_points, 2) AS avg_points
FROM ranked_players
WHERE position_rank <= 3
ORDER BY position, position_rank;

-- 7. Keyword full-text search over generated scouting-report search vectors.
SELECT
  sr.report_id,
  p.f_name,
  p.l_name,
  ts_rank_cd(
    sr.search_vector,
    plainto_tsquery('english', 'points rebounds assists')
  ) AS keyword_rank,
  sr.summary
FROM scouting_report sr
JOIN player p ON p.player_id = sr.player_id
WHERE sr.search_vector @@ plainto_tsquery('english', 'points rebounds assists')
ORDER BY keyword_rank DESC, sr.report_id
LIMIT 10;

-- 8. Pure vector search: find reports nearest to one embedded report.
-- The scalar subqueries select the same anchor and support HNSW ORDER BY.
SELECT
  sr.report_id,
  p.f_name,
  p.l_name,
  1 - (
    sr.embedding <=> (
      SELECT anchor.embedding
      FROM scouting_report anchor
      WHERE anchor.embedding IS NOT NULL
      ORDER BY anchor.report_id
      LIMIT 1
    )
  ) AS cosine_similarity,
  sr.summary
FROM scouting_report sr
JOIN player p ON p.player_id = sr.player_id
WHERE sr.embedding IS NOT NULL
  AND sr.embedding_model = (
    SELECT anchor.embedding_model
    FROM scouting_report anchor
    WHERE anchor.embedding IS NOT NULL
    ORDER BY anchor.report_id
    LIMIT 1
  )
  AND sr.report_id <> (
    SELECT anchor.report_id
    FROM scouting_report anchor
    WHERE anchor.embedding IS NOT NULL
    ORDER BY anchor.report_id
    LIMIT 1
  )
ORDER BY sr.embedding <=> (
  SELECT anchor.embedding
  FROM scouting_report anchor
  WHERE anchor.embedding IS NOT NULL
  ORDER BY anchor.report_id
  LIMIT 1
)
LIMIT 10;

-- 9. Hybrid search: nearest reports plus an exact player-position filter.
WITH anchor AS MATERIALIZED (
  SELECT sr.report_id, sr.embedding, sr.embedding_model, p.position
  FROM scouting_report sr
  JOIN player p ON p.player_id = sr.player_id
  WHERE sr.embedding IS NOT NULL
    AND p.position IS NOT NULL
  ORDER BY sr.report_id
  LIMIT 1
)
SELECT
  sr.report_id,
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  1 - (sr.embedding <=> anchor.embedding) AS cosine_similarity,
  sr.summary
FROM anchor
JOIN scouting_report sr
  ON sr.embedding_model = anchor.embedding_model
 AND sr.embedding IS NOT NULL
JOIN player p ON p.player_id = sr.player_id
WHERE sr.report_id <> anchor.report_id
  AND p.position = anchor.position
ORDER BY sr.embedding <=> anchor.embedding
LIMIT 10;

-- 10. Vector query plan without the report HNSW index.
-- Transactional DDL removes it for this plan only and ROLLBACK restores it.
-- Run against the demo database, not during concurrent application traffic.
BEGIN;
DROP INDEX IF EXISTS idx_scouting_report_embedding_hnsw;
EXPLAIN (ANALYZE, BUFFERS)
SELECT sr.report_id
FROM scouting_report sr
WHERE sr.embedding IS NOT NULL
ORDER BY sr.embedding <=> (
  SELECT anchor.embedding
  FROM scouting_report anchor
  WHERE anchor.embedding IS NOT NULL
  ORDER BY anchor.report_id
  LIMIT 1
)
LIMIT 5;
ROLLBACK;

-- 11. Same vector query with the Phase 3C HNSW index present.
-- Sequential scans are discouraged to make the index plan visible on demo data.
SET enable_seqscan = off;
EXPLAIN (ANALYZE, BUFFERS)
SELECT sr.report_id
FROM scouting_report sr
WHERE sr.embedding IS NOT NULL
ORDER BY sr.embedding <=> (
  SELECT anchor.embedding
  FROM scouting_report anchor
  WHERE anchor.embedding IS NOT NULL
  ORDER BY anchor.report_id
  LIMIT 1
)
LIMIT 5;
RESET enable_seqscan;

-- The procedure is called inside the acceptance transaction below so its
-- locking, need update, audit row, and rollback behavior are demonstrated.

BEGIN;

DO $$
DECLARE
  v_home_team BIGINT;
  v_away_team BIGINT;
  v_outsider_team BIGINT;
  v_scout_person BIGINT;
  v_bad_person BIGINT;
  v_player BIGINT;
  v_prospect BIGINT;
  v_roster BIGINT;
  v_second_roster BIGINT;
  v_cap_roster BIGINT;
  v_game BIGINT;
  v_second_game BIGINT;
  v_invalid_game BIGINT;
  v_report BIGINT;
  v_cap_player BIGINT;
  v_match_found BOOLEAN;
  v_duplicate_rejected BOOLEAN := false;
  v_cap_rejected BOOLEAN := false;
  v_bad_team_rejected BOOLEAN := false;
  v_71_rejected BOOLEAN := false;
  v_role_rejected BOOLEAN := false;
  v_stale_embedding_cleared BOOLEAN;
  v_need_filled BOOLEAN;
  v_audit_written BOOLEAN;
  v_efficiency NUMERIC;
  i INTEGER;
BEGIN
  INSERT INTO team (external_id, team_name, city)
  VALUES ('phase2-home', 'Phase 2 Home', 'Test City')
  RETURNING team_id INTO v_home_team;
  INSERT INTO team (external_id, team_name, city)
  VALUES ('phase2-away', 'Phase 2 Away', 'Test City')
  RETURNING team_id INTO v_away_team;
  INSERT INTO team (external_id, team_name, city)
  VALUES ('phase2-outsider', 'Phase 2 Outsider', 'Test City')
  RETURNING team_id INTO v_outsider_team;

  INSERT INTO person (
    f_name, l_name, email, password_hash, role
  ) VALUES (
    'Phase', 'Scout', 'phase2-scout@example.test', 'test-hash', 'scout'
  ) RETURNING person_id INTO v_scout_person;
  INSERT INTO scout (person_id, experience)
  VALUES (v_scout_person, 5);
  PERFORM set_config('app.current_user_id', v_scout_person::TEXT, true);

  -- A person without its matching subtype must fail when deferred checks fire.
  INSERT INTO person (
    f_name, l_name, email, password_hash, role
  ) VALUES (
    'Invalid', 'Subtype', 'phase2-invalid@example.test', 'test-hash', 'scout'
  ) RETURNING person_id INTO v_bad_person;
  BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN foreign_key_violation THEN
    v_role_rejected := true;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT v_role_rejected THEN
    RAISE EXCEPTION 'FAIL: person without matching subtype was accepted';
  END IF;

  INSERT INTO player (external_id, f_name, l_name, position)
  VALUES ('phase2-player', 'Phase', 'Prospect', 'PG')
  RETURNING player_id INTO v_player;
  INSERT INTO draft_prospect (player_id, college, class_year)
  VALUES (v_player, NULL, 2026)
  RETURNING prospect_id INTO v_prospect;
  INSERT INTO team_need (team_id, position, priority, description)
  VALUES (v_home_team, 'PG', 5, 'Phase 2 guard need');
  INSERT INTO roster (team_id, season, is_historical)
  VALUES (v_home_team, 2026, false)
  RETURNING roster_id INTO v_roster;
  INSERT INTO roster (team_id, season, is_historical)
  VALUES (v_away_team, 2026, false)
  RETURNING roster_id INTO v_second_roster;

  SELECT EXISTS (
    SELECT 1
    FROM fn_match_prospects_for_team(v_home_team)
    WHERE prospect_id = v_prospect
      AND match_score > 0
  ) INTO v_match_found;
  IF NOT v_match_found THEN
    RAISE EXCEPTION 'FAIL: prospect matching function returned no scored match';
  END IF;

  CALL sp_draft_prospect_to_roster(v_prospect, v_roster);
  SELECT is_filled INTO v_need_filled
  FROM team_need
  WHERE team_id = v_home_team AND position = 'PG';
  IF NOT v_need_filled THEN
    RAISE EXCEPTION 'FAIL: draft procedure did not fill the matching need';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM audit_log
    WHERE table_name = 'roster_player'
      AND action = 'INSERT'
      AND changed_by = v_scout_person
  ) INTO v_audit_written;
  IF NOT v_audit_written THEN
    RAISE EXCEPTION 'FAIL: roster membership audit row was not written';
  END IF;

  BEGIN
    CALL sp_draft_prospect_to_roster(v_prospect, v_second_roster);
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_rejected := true;
  END;
  IF NOT v_duplicate_rejected THEN
    RAISE EXCEPTION 'FAIL: duplicate draft was accepted';
  END IF;

  -- The roster-size trigger allows 15 and rejects the 16th player.
  INSERT INTO roster (team_id, season, is_historical)
  VALUES (v_away_team, 2027, false)
  RETURNING roster_id INTO v_cap_roster;
  FOR i IN 1..16 LOOP
    INSERT INTO player (f_name, l_name, position)
    VALUES ('Cap', 'Player ' || i, 'SG')
    RETURNING player_id INTO v_cap_player;
    BEGIN
      INSERT INTO roster_player (roster_id, player_id, season)
      VALUES (v_cap_roster, v_cap_player, 2027);
    EXCEPTION WHEN check_violation THEN
      v_cap_rejected := true;
    END;
  END LOOP;
  IF NOT v_cap_rejected THEN
    RAISE EXCEPTION 'FAIL: sixteenth player was accepted onto a managed roster';
  END IF;

  INSERT INTO game (external_id, game_date, season, home_team_id, away_team_id)
  VALUES ('phase2-game-69', DATE '2026-01-01', 2026, v_home_team, v_away_team)
  RETURNING game_id INTO v_game;
  INSERT INTO game_performance (game_id, player_id, team_id, minutes, points, rebounds, assists, blocks, steals)
  VALUES (v_game, v_player, v_home_team, 69, 10, 5, 4, 1, 2);

  INSERT INTO game (external_id, game_date, season, home_team_id, away_team_id)
  VALUES ('phase2-game-71', DATE '2026-01-02', 2026, v_home_team, v_away_team)
  RETURNING game_id INTO v_second_game;
  BEGIN
    INSERT INTO game_performance (game_id, player_id, team_id, minutes, points)
    VALUES (v_second_game, v_player, v_home_team, 71, 10);
  EXCEPTION WHEN check_violation THEN
    v_71_rejected := true;
  END;
  IF NOT v_71_rejected THEN
    RAISE EXCEPTION 'FAIL: 71 minutes was accepted';
  END IF;

  INSERT INTO game (external_id, game_date, season, home_team_id, away_team_id)
  VALUES ('phase2-game-invalid-team', DATE '2026-01-03', 2026, v_home_team, v_away_team)
  RETURNING game_id INTO v_invalid_game;
  BEGIN
    INSERT INTO game_performance (game_id, player_id, team_id, minutes, points)
    VALUES (v_invalid_game, v_player, v_outsider_team, 20, 10);
  EXCEPTION WHEN check_violation THEN
    v_bad_team_rejected := true;
  END;
  IF NOT v_bad_team_rejected THEN
    RAISE EXCEPTION 'FAIL: non-participant team was accepted for a performance';
  END IF;

  SELECT fn_player_efficiency(v_player) INTO v_efficiency;
  IF v_efficiency <= 0 THEN
    RAISE EXCEPTION 'FAIL: player efficiency was not calculated';
  END IF;

  INSERT INTO scouting_report (
    player_id, scout_id, summary, embedding, embedding_model, embedded_at
  ) VALUES (
    v_player,
    v_scout_person,
    'Initial indexed report',
    ('[' || repeat('0,', 383) || '0]')::vector,
    'test-model',
    now()
  ) RETURNING report_id INTO v_report;
  UPDATE scouting_report
  SET summary = 'Updated report text'
  WHERE report_id = v_report;
  SELECT embedding IS NULL AND embedding_model IS NULL AND embedded_at IS NULL
  INTO v_stale_embedding_cleared
  FROM scouting_report
  WHERE report_id = v_report;
  IF NOT v_stale_embedding_cleared THEN
    RAISE EXCEPTION 'FAIL: stale report embedding was not cleared';
  END IF;

  RAISE NOTICE 'PASS: views, functions, procedure, triggers, audit, rollback fixtures, and failing cases verified';
END
$$;

ROLLBACK;

-- Verify the explicit test transaction rolled back all Phase 2 fixtures.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM team WHERE external_id IN (
      'phase2-home', 'phase2-away', 'phase2-outsider'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL: Phase 2 acceptance transaction did not roll back';
  END IF;
  RAISE NOTICE 'PASS: Phase 2 acceptance transaction rolled back';
END
$$;
