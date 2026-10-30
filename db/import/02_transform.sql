-- Phase 3A transform for the documented 2017-2019 NBA subset.
-- Re-running is safe: source external IDs and natural measurement keys make
-- all target writes idempotent. No rows are inserted into draft_prospect.

BEGIN;

DELETE FROM import_unmatched WHERE source_name = 'Draft Combine - Kaggle';

-- Source team rows, plus a conservative fallback for any game team absent from
-- teams.csv, are needed before games and performances can be resolved.
WITH source_teams AS (
  SELECT DISTINCT ON (trim(team_id))
    trim(team_id) AS team_id,
    NULLIF(trim(city), '') AS city,
    NULLIF(trim(nickname), '') AS nickname
  FROM stg_nba_team
  WHERE trim(coalesce(team_id, '')) <> ''
  ORDER BY trim(team_id), max_year DESC NULLS LAST
), game_team_ids AS (
  SELECT trim(home_team_id) AS team_id FROM stg_nba_game WHERE season IN ('2017', '2018', '2019')
  UNION
  SELECT trim(visitor_team_id) FROM stg_nba_game WHERE season IN ('2017', '2018', '2019')
), resolved_teams AS (
  SELECT g.team_id,
    COALESCE(st.city, 'Unknown') AS city,
    COALESCE(NULLIF(concat_ws(' ', st.city, st.nickname), ''), 'NBA Team ' || g.team_id) AS team_name
  FROM game_team_ids g
  LEFT JOIN source_teams st ON st.team_id = g.team_id
  WHERE g.team_id <> ''
)
INSERT INTO team (external_id, team_name, city)
SELECT 'nba:' || team_id, team_name, city FROM resolved_teams
ON CONFLICT (external_id) DO UPDATE SET team_name = EXCLUDED.team_name, city = EXCLUDED.city;

WITH valid_games AS (
  SELECT DISTINCT ON (trim(s.game_id))
    trim(s.game_id) AS game_id, trim(s.game_date_est)::date AS game_date,
    trim(s.season)::smallint AS season, home.team_id AS home_team_id, away.team_id AS away_team_id
  FROM stg_nba_game s
  JOIN team home ON home.external_id = 'nba:' || trim(s.home_team_id)
  JOIN team away ON away.external_id = 'nba:' || trim(s.visitor_team_id)
  WHERE trim(s.season) IN ('2017', '2018', '2019')
    AND trim(s.game_date_est) ~ '^\\d{4}-\\d{2}-\\d{2}$'
    AND trim(s.home_team_id) <> trim(s.visitor_team_id)
  ORDER BY trim(s.game_id), trim(s.game_date_est) DESC
)
INSERT INTO game (external_id, game_date, season, home_team_id, away_team_id)
SELECT 'nba:' || game_id, game_date, season, home_team_id, away_team_id FROM valid_games
ON CONFLICT (external_id) DO UPDATE
SET game_date = EXCLUDED.game_date, season = EXCLUDED.season,
    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id;

-- A player needs at least 25 selected-subset appearances, unless a safe
-- Draft Combine match supplies measurements. Names retain suffixes: only
-- punctuation and case are normalized, never tokens such as Jr. or II.
WITH candidate_rows AS (
  SELECT trim(d.player_id) AS source_player_id, trim(d.player_name) AS player_name,
         g.season
  FROM stg_nba_game_detail d
  JOIN game g ON g.external_id = 'nba:' || trim(d.game_id)
  WHERE trim(coalesce(d.player_id, '')) <> '' AND trim(coalesce(d.player_name, '')) <> ''
), candidates AS (
  SELECT source_player_id, max(player_name) AS player_name, min(season) AS first_seen_season,
         count(*) AS games_played, import_normalize_name(max(player_name)) AS normalized_name
  FROM candidate_rows GROUP BY source_player_id
), combine_rows AS (
  SELECT trim(year)::smallint AS combine_year, trim(player) AS raw_name,
         trim(regexp_replace(player, '^\\s*([^,]+),\\s*(.+?)\\s*$', '\\2 \\1')) AS nba_order_name,
         pos, hgt, wgt, wngspn, stndrch, stndvert, lpvert, lane, shuttle, sprint, bench
  FROM stg_draft_combine
  WHERE trim(coalesce(year, '')) ~ '^\\d{4}$' AND trim(coalesce(player, '')) <> ''
), combine_named AS (
  SELECT *, import_normalize_name(nba_order_name) AS normalized_name,
         count(*) OVER (PARTITION BY import_normalize_name(nba_order_name)) AS combine_name_count
  FROM combine_rows
), candidate_named AS (
  SELECT *, count(*) OVER (PARTITION BY normalized_name) AS nba_name_count FROM candidates
), safe_combine AS (
  SELECT c.*, n.source_player_id
  FROM combine_named c
  JOIN candidate_named n ON n.normalized_name = c.normalized_name
  WHERE c.combine_name_count = 1 AND n.nba_name_count = 1
    AND n.first_seen_season BETWEEN c.combine_year AND c.combine_year + 8
), eligible AS (
  SELECT source_player_id FROM candidates WHERE games_played >= 25
  UNION SELECT source_player_id FROM safe_combine
), player_payload AS (
  SELECT DISTINCT ON (c.source_player_id) c.source_player_id, c.player_name, sc.pos, sc.hgt, sc.wgt
  FROM candidates c
  JOIN eligible e ON e.source_player_id = c.source_player_id
  LEFT JOIN safe_combine sc ON sc.source_player_id = c.source_player_id
  ORDER BY c.source_player_id, sc.combine_year DESC NULLS LAST
)
INSERT INTO player (external_id, f_name, l_name, height_cm, weight_kg, position, secondary_position)
SELECT 'nba:' || source_player_id,
       NULLIF(regexp_replace(player_name, '\\s+\\S+\\s*$', ''), ''),
       regexp_replace(player_name, '^.*\\s', ''),
       CASE WHEN hgt ~ '^\\d+(\\.\\d+)?$' THEN round((hgt::numeric * 2.54), 2) END,
       CASE WHEN wgt ~ '^\\d+(\\.\\d+)?$' THEN round((wgt::numeric * 0.45359237), 2) END,
       CASE WHEN upper(split_part(replace(coalesce(pos, ''), '/', '-'), '-', 1)) IN ('PG','SG','SF','PF','C')
         THEN upper(split_part(replace(pos, '/', '-'), '-', 1))::player_position END,
       CASE WHEN upper(split_part(replace(coalesce(pos, ''), '/', '-'), '-', 2)) IN ('PG','SG','SF','PF','C')
         THEN upper(split_part(replace(pos, '/', '-'), '-', 2))::player_position END
FROM player_payload
WHERE player_name ~ '\\s+'
ON CONFLICT (external_id) DO UPDATE SET
  height_cm = COALESCE(EXCLUDED.height_cm, player.height_cm),
  weight_kg = COALESCE(EXCLUDED.weight_kg, player.weight_kg),
  position = COALESCE(EXCLUDED.position, player.position),
  secondary_position = CASE WHEN EXCLUDED.secondary_position = COALESCE(EXCLUDED.position, player.position)
    THEN player.secondary_position ELSE COALESCE(EXCLUDED.secondary_position, player.secondary_position) END;

-- Reject every non-safe combine row with an actionable reason. This is
-- intentionally stricter than fuzzy matching: an uncertain measurement is
-- less useful than an auditable unmatched record.
WITH candidate_rows AS (
  SELECT trim(d.player_id) AS source_player_id, trim(d.player_name) AS player_name, g.season
  FROM stg_nba_game_detail d JOIN game g ON g.external_id = 'nba:' || trim(d.game_id)
  WHERE trim(coalesce(d.player_id, '')) <> '' AND trim(coalesce(d.player_name, '')) <> ''
), candidates AS (
  SELECT source_player_id, min(season) AS first_seen_season,
    import_normalize_name(max(player_name)) AS normalized_name
  FROM candidate_rows GROUP BY source_player_id
), candidate_counts AS (
  SELECT normalized_name, count(*) AS nba_name_count, min(first_seen_season) AS first_seen_season
  FROM candidates GROUP BY normalized_name
), combines AS (
  SELECT trim(year)::smallint AS combine_year, trim(player) AS raw_name,
    import_normalize_name(trim(regexp_replace(player, '^\\s*([^,]+),\\s*(.+?)\\s*$', '\\2 \\1'))) AS normalized_name
  FROM stg_draft_combine WHERE trim(coalesce(year, '')) ~ '^\\d{4}$' AND trim(coalesce(player, '')) <> ''
), classified AS (
  SELECT c.*, count(*) OVER (PARTITION BY c.normalized_name) AS combine_name_count,
    cc.nba_name_count, cc.first_seen_season
  FROM combines c LEFT JOIN candidate_counts cc USING (normalized_name)
)
INSERT INTO import_unmatched (source_name, source_row_key, raw_name, normalized_name, source_year, reason, details)
SELECT 'Draft Combine - Kaggle', combine_year || ':' || raw_name, raw_name, normalized_name, combine_year,
  CASE WHEN combine_name_count > 1 THEN 'ambiguous_combine_name'
       WHEN coalesce(nba_name_count, 0) = 0 THEN 'no_nba_candidate_name_match'
       WHEN nba_name_count > 1 THEN 'ambiguous_nba_player_name'
       ELSE 'failed_debut_season_plausibility' END,
  jsonb_build_object('nbaCandidateCount', coalesce(nba_name_count, 0), 'firstSeenSeason', first_seen_season)
FROM classified
WHERE NOT (combine_name_count = 1 AND nba_name_count = 1
           AND first_seen_season BETWEEN combine_year AND combine_year + 8)
ON CONFLICT (source_name, source_row_key) DO UPDATE SET
  raw_name = EXCLUDED.raw_name, normalized_name = EXCLUDED.normalized_name,
  source_year = EXCLUDED.source_year, reason = EXCLUDED.reason,
  details = EXCLUDED.details, recorded_at = now();

WITH raw_performance AS (
  SELECT d.*, g.game_id AS project_game_id, g.home_team_id, g.away_team_id,
    p.player_id AS project_player_id, t.team_id AS project_team_id,
    CASE WHEN trim(d.min) ~ '^\\d+:\\d{2}$'
      THEN split_part(trim(d.min), ':', 1)::numeric + split_part(trim(d.min), ':', 2)::numeric / 60
      WHEN trim(d.min) ~ '^\\d+(\\.\\d+)?$' THEN trim(d.min)::numeric END AS minutes_value
  FROM stg_nba_game_detail d
  JOIN game g ON g.external_id = 'nba:' || trim(d.game_id)
  JOIN player p ON p.external_id = 'nba:' || trim(d.player_id)
  JOIN team t ON t.external_id = 'nba:' || trim(d.team_id)
), valid_performance AS (
  SELECT * FROM raw_performance
  WHERE minutes_value BETWEEN 0 AND 70 AND project_team_id IN (home_team_id, away_team_id)
)
INSERT INTO game_performance (game_id, player_id, team_id, minutes, points, rebounds, assists, blocks, steals)
SELECT project_game_id, project_player_id, project_team_id, minutes_value,
  CASE WHEN trim(pts) ~ '^\\d+(\\.\\d+)?$' THEN trim(pts)::numeric ELSE 0 END,
  CASE WHEN trim(reb) ~ '^\\d+(\\.\\d+)?$' THEN trim(reb)::numeric ELSE 0 END,
  CASE WHEN trim(ast) ~ '^\\d+(\\.\\d+)?$' THEN trim(ast)::numeric ELSE 0 END,
  CASE WHEN trim(blk) ~ '^\\d+(\\.\\d+)?$' THEN trim(blk)::numeric ELSE 0 END,
  CASE WHEN trim(stl) ~ '^\\d+(\\.\\d+)?$' THEN trim(stl)::numeric ELSE 0 END
FROM valid_performance
ON CONFLICT (game_id, player_id) DO NOTHING;

WITH roster_choice AS (
  SELECT gp.player_id, g.season, gp.team_id, count(*) AS games_for_team,
    row_number() OVER (PARTITION BY gp.player_id, g.season ORDER BY count(*) DESC, gp.team_id) AS choice_rank
  FROM game_performance gp JOIN game g ON g.game_id = gp.game_id
  WHERE g.external_id LIKE 'nba:%'
  GROUP BY gp.player_id, g.season, gp.team_id
), winners AS (
  SELECT * FROM roster_choice WHERE choice_rank = 1
)
INSERT INTO roster (team_id, season, is_historical)
SELECT DISTINCT team_id, season, true FROM winners
ON CONFLICT (team_id, season) DO UPDATE SET is_historical = true;

WITH roster_choice AS (
  SELECT gp.player_id, g.season, gp.team_id,
    row_number() OVER (PARTITION BY gp.player_id, g.season ORDER BY count(*) DESC, gp.team_id) AS choice_rank
  FROM game_performance gp JOIN game g ON g.game_id = gp.game_id
  WHERE g.external_id LIKE 'nba:%'
  GROUP BY gp.player_id, g.season, gp.team_id
)
INSERT INTO roster_player (roster_id, player_id, season)
SELECT r.roster_id, rc.player_id, rc.season
FROM roster_choice rc JOIN roster r ON r.team_id = rc.team_id AND r.season = rc.season
WHERE rc.choice_rank = 1
ON CONFLICT (roster_id, player_id) DO NOTHING;

-- Only safely matched rows contribute measurements. Wide source columns are
-- converted and unpivoted here; NA and unsupported derived fields are skipped.
WITH candidate_rows AS (
  SELECT trim(d.player_id) AS source_player_id, trim(d.player_name) AS player_name, g.season
  FROM stg_nba_game_detail d JOIN game g ON g.external_id = 'nba:' || trim(d.game_id)
  WHERE trim(coalesce(d.player_id, '')) <> '' AND trim(coalesce(d.player_name, '')) <> ''
), candidates AS (
  SELECT source_player_id, min(season) AS first_seen_season,
    import_normalize_name(max(player_name)) AS normalized_name
  FROM candidate_rows GROUP BY source_player_id
), candidate_named AS (
  SELECT *, count(*) OVER (PARTITION BY normalized_name) AS name_count FROM candidates
), combine_rows AS (
  SELECT trim(year)::smallint AS combine_year, trim(player) AS raw_name, pos, hgt, wgt, wngspn, stndrch, stndvert, lpvert, lane, shuttle, sprint, bench,
    import_normalize_name(trim(regexp_replace(player, '^\\s*([^,]+),\\s*(.+?)\\s*$', '\\2 \\1'))) AS normalized_name
  FROM stg_draft_combine WHERE trim(coalesce(year, '')) ~ '^\\d{4}$' AND trim(coalesce(player, '')) <> ''
), safe_combine AS (
  SELECT c.*, n.source_player_id, count(*) OVER (PARTITION BY c.normalized_name) AS combine_name_count
  FROM combine_rows c JOIN candidate_named n USING (normalized_name)
  WHERE n.name_count = 1 AND n.first_seen_season BETWEEN c.combine_year AND c.combine_year + 8
), measurements AS (
  SELECT p.player_id, sc.combine_year, m.measurement_type::measurement_type, m.raw_value, m.unit, m.multiplier
  FROM safe_combine sc JOIN player p ON p.external_id = 'nba:' || sc.source_player_id
  CROSS JOIN LATERAL (VALUES
    ('height_cm', sc.hgt, 'cm', 2.54::numeric), ('weight_kg', sc.wgt, 'kg', 0.45359237::numeric),
    ('wingspan_cm', sc.wngspn, 'cm', 2.54::numeric), ('standing_reach_cm', sc.stndrch, 'cm', 2.54::numeric),
    ('vertical_leap_cm', sc.lpvert, 'cm', 2.54::numeric), ('bench_press_reps', sc.bench, 'reps', 1::numeric),
    ('lane_agility_seconds', sc.lane, 'seconds', 1::numeric), ('three_quarter_sprint_seconds', sc.sprint, 'seconds', 1::numeric),
    ('shuttle_run_seconds', sc.shuttle, 'seconds', 1::numeric)
  ) AS m(measurement_type, raw_value, unit, multiplier)
  WHERE sc.combine_name_count = 1
)
INSERT INTO combined_measurement (player_id, measurement_type, combine_year, measured_on, value, unit)
SELECT player_id, measurement_type, combine_year, NULL,
  round(raw_value::numeric * multiplier, 2), unit
FROM measurements
WHERE trim(coalesce(raw_value, '')) ~ '^\\d+(\\.\\d+)?$'
ON CONFLICT (player_id, measurement_type, combine_year) DO UPDATE
SET value = EXCLUDED.value, unit = EXCLUDED.unit;

COMMIT;

-- Phase 3A import report: preserve this output with the run log.
SELECT 'team' AS entity, count(*) AS rows FROM team WHERE external_id LIKE 'nba:%'
UNION ALL SELECT 'player', count(*) FROM player WHERE external_id LIKE 'nba:%'
UNION ALL SELECT 'game', count(*) FROM game WHERE external_id LIKE 'nba:%'
UNION ALL SELECT 'game_performance', count(*) FROM game_performance
UNION ALL SELECT 'historical_roster', count(*) FROM roster WHERE is_historical
UNION ALL SELECT 'combined_measurement', count(*) FROM combined_measurement
UNION ALL SELECT 'combine_unmatched', count(*) FROM import_unmatched WHERE source_name = 'Draft Combine - Kaggle'
ORDER BY entity;

SELECT reason, count(*) AS rows
FROM import_unmatched WHERE source_name = 'Draft Combine - Kaggle'
GROUP BY reason ORDER BY reason;
