-- DraftBoard Phase 2 showcase calls and acceptance demonstrations.
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
  INSERT INTO team (external_id, team_name, city, abbreviation)
  VALUES ('phase2-home', 'Phase 2 Home', 'Test City', 'P2H')
  RETURNING team_id INTO v_home_team;
  INSERT INTO team (external_id, team_name, city, abbreviation)
  VALUES ('phase2-away', 'Phase 2 Away', 'Test City', 'P2A')
  RETURNING team_id INTO v_away_team;
  INSERT INTO team (external_id, team_name, city, abbreviation)
  VALUES ('phase2-outsider', 'Phase 2 Outsider', 'Test City', 'P2O')
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
