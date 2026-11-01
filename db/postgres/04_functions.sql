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
