-- Phase 1 acceptance checks. The transaction is rolled back, so this file
-- leaves the schema empty after testing.

DO $$
DECLARE
  home_team BIGINT;
  away_team BIGINT;
  test_player BIGINT;
  first_roster BIGINT;
  second_roster BIGINT;
  duplicate_rejected BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension is not installed';
  END IF;

  INSERT INTO team (external_id, team_name, city, abbreviation)
  VALUES ('phase1-home', 'Phase 1 Home', 'Test City', 'P1H')
  RETURNING team_id INTO home_team;
  INSERT INTO team (external_id, team_name, city, abbreviation)
  VALUES ('phase1-away', 'Phase 1 Away', 'Test City', 'P1A')
  RETURNING team_id INTO away_team;
  INSERT INTO player (external_id, f_name, l_name, position)
  VALUES ('phase1-player', 'Phase', 'Player', 'PG')
  RETURNING player_id INTO test_player;
  INSERT INTO roster (team_id, season) VALUES (home_team, 2026)
  RETURNING roster_id INTO first_roster;
  INSERT INTO roster (team_id, season) VALUES (away_team, 2026)
  RETURNING roster_id INTO second_roster;

  INSERT INTO roster_player (roster_id, player_id, season)
  VALUES (first_roster, test_player, 2026);

  BEGIN
    INSERT INTO roster_player (roster_id, player_id, season)
    VALUES (second_roster, test_player, 2026);
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;

  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'duplicate player-season roster membership was accepted';
  END IF;

  RAISE NOTICE 'PASS: one player cannot appear in two rosters in one season';
END
$$;
