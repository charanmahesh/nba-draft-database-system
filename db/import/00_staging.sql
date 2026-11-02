-- Phase 3A raw staging area. Every CSV column remains TEXT so that cleaning is
-- explicit and source values never bypass the transformation rules.

CREATE TABLE IF NOT EXISTS stg_nba_team (
  league_id TEXT, team_id TEXT, min_year TEXT, max_year TEXT, abbreviation TEXT,
  nickname TEXT, yearfounded TEXT, city TEXT, arena TEXT, arenacapacity TEXT,
  owner TEXT, generalmanager TEXT, headcoach TEXT, dleagueaffiliation TEXT
);

CREATE TABLE IF NOT EXISTS stg_nba_player (
  player_name TEXT, team_id TEXT, player_id TEXT, season TEXT
);

CREATE TABLE IF NOT EXISTS stg_nba_game (
  game_date_est TEXT, game_id TEXT, game_status_text TEXT, home_team_id TEXT,
  visitor_team_id TEXT, season TEXT, team_id_home TEXT, pts_home TEXT,
  fg_pct_home TEXT, ft_pct_home TEXT, fg3_pct_home TEXT, ast_home TEXT,
  reb_home TEXT, team_id_away TEXT, pts_away TEXT, fg_pct_away TEXT,
  ft_pct_away TEXT, fg3_pct_away TEXT, ast_away TEXT, reb_away TEXT,
  home_team_wins TEXT
);

CREATE TABLE IF NOT EXISTS stg_nba_game_detail (
  game_id TEXT, team_id TEXT, team_abbreviation TEXT, team_city TEXT, player_id TEXT,
  player_name TEXT, nickname TEXT, start_position TEXT, comment TEXT, min TEXT,
  fgm TEXT, fga TEXT, fg_pct TEXT, fg3m TEXT, fg3a TEXT, fg3_pct TEXT,
  ftm TEXT, fta TEXT, ft_pct TEXT, oreb TEXT, dreb TEXT, reb TEXT, ast TEXT,
  stl TEXT, blk TEXT, turnover TEXT, pf TEXT, pts TEXT, plus_minus TEXT
);

CREATE TABLE IF NOT EXISTS stg_draft_combine (
  year TEXT, player TEXT, pos TEXT, hgt TEXT, wgt TEXT, bmi TEXT, bf TEXT,
  wngspn TEXT, stndrch TEXT, handl TEXT, handw TEXT, stndvert TEXT, lpvert TEXT,
  lane TEXT, shuttle TEXT, sprint TEXT, bench TEXT, bar TEXT, pan TEXT,
  pbhgt TEXT, pdhgt TEXT
);

-- This is a durable import report, not staging data. It makes every rejected
-- or ambiguous Draft Combine match inspectable and rerunnable.
CREATE TABLE IF NOT EXISTS import_unmatched (
  import_unmatched_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_row_key TEXT NOT NULL,
  raw_name TEXT,
  normalized_name TEXT,
  source_year SMALLINT,
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_import_unmatched_source_row UNIQUE (source_name, source_row_key)
);

CREATE INDEX IF NOT EXISTS idx_import_unmatched_source_reason
  ON import_unmatched(source_name, reason);

CREATE OR REPLACE FUNCTION import_normalize_name(input_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(regexp_replace(lower(trim(input_name)), '[^a-z0-9]+', '', 'g'), '')
$$;
