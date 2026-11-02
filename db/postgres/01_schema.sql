-- DraftBoard Phase 1 relational schema.
-- This file intentionally contains DDL only: Phase 2 views, functions, and
-- triggers are added in later migration files.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'person_role') THEN
    CREATE TYPE person_role AS ENUM ('admin', 'scout', 'analyst', 'team_manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_position') THEN
    CREATE TYPE player_position AS ENUM ('PG', 'SG', 'SF', 'PF', 'C');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'injury_severity') THEN
    CREATE TYPE injury_severity AS ENUM ('minor', 'moderate', 'severe');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'measurement_type') THEN
    CREATE TYPE measurement_type AS ENUM (
      'height_cm',
      'weight_kg',
      'wingspan_cm',
      'standing_reach_cm',
      'vertical_leap_cm',
      'bench_press_reps',
      'lane_agility_seconds',
      'three_quarter_sprint_seconds',
      'shuttle_run_seconds'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS team (
  team_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id TEXT UNIQUE,
  team_name TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS person (
  person_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  f_name TEXT NOT NULL,
  l_name TEXT NOT NULL,
  dob DATE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role person_role NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  UNIQUE (person_id, role)
);

CREATE TABLE IF NOT EXISTS person_phone (
  person_id BIGINT NOT NULL,
  phone_number TEXT NOT NULL,
  PRIMARY KEY (person_id, phone_number),
  CONSTRAINT fk_person_phone_person
    FOREIGN KEY (person_id) REFERENCES person(person_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scout (
  person_id BIGINT PRIMARY KEY,
  role person_role NOT NULL DEFAULT 'scout' CHECK (role = 'scout'),
  experience SMALLINT CHECK (experience IS NULL OR experience >= 0),
  CONSTRAINT fk_scout_person_role
    FOREIGN KEY (person_id, role) REFERENCES person(person_id, role) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analyst (
  person_id BIGINT PRIMARY KEY,
  role person_role NOT NULL DEFAULT 'analyst' CHECK (role = 'analyst'),
  specialization TEXT,
  CONSTRAINT fk_analyst_person_role
    FOREIGN KEY (person_id, role) REFERENCES person(person_id, role) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_manager (
  person_id BIGINT PRIMARY KEY,
  role person_role NOT NULL DEFAULT 'team_manager' CHECK (role = 'team_manager'),
  team_id BIGINT NOT NULL,
  CONSTRAINT fk_team_manager_person_role
    FOREIGN KEY (person_id, role) REFERENCES person(person_id, role) ON DELETE CASCADE,
  CONSTRAINT fk_team_manager_team
    FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS admin (
  person_id BIGINT PRIMARY KEY,
  role person_role NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  CONSTRAINT fk_admin_person_role
    FOREIGN KEY (person_id, role) REFERENCES person(person_id, role) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_need (
  need_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL,
  position player_position NOT NULL,
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 5),
  description TEXT,
  is_filled BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_team_need_team
    FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS roster (
  roster_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL,
  season SMALLINT NOT NULL CHECK (season BETWEEN 1900 AND 2200),
  is_historical BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_roster_team_season UNIQUE (team_id, season),
  CONSTRAINT uq_roster_id_season UNIQUE (roster_id, season),
  CONSTRAINT fk_roster_team
    FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS player (
  player_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id TEXT UNIQUE,
  f_name TEXT NOT NULL,
  l_name TEXT NOT NULL,
  dob DATE,
  height_cm NUMERIC CHECK (height_cm IS NULL OR height_cm BETWEEN 150 AND 240),
  weight_kg NUMERIC CHECK (weight_kg IS NULL OR weight_kg BETWEEN 45 AND 200),
  position player_position,
  secondary_position player_position,
  CONSTRAINT chk_player_secondary_position
    CHECK (secondary_position IS NULL OR secondary_position <> position)
);

CREATE TABLE IF NOT EXISTS roster_player (
  roster_id BIGINT NOT NULL,
  player_id BIGINT NOT NULL,
  season SMALLINT NOT NULL,
  PRIMARY KEY (roster_id, player_id),
  CONSTRAINT uq_roster_player_player_season UNIQUE (player_id, season),
  CONSTRAINT fk_roster_player_roster_season
    FOREIGN KEY (roster_id, season) REFERENCES roster(roster_id, season) ON DELETE CASCADE,
  CONSTRAINT fk_roster_player_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS draft_prospect (
  prospect_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id BIGINT NOT NULL UNIQUE,
  college TEXT,
  class_year SMALLINT NOT NULL CHECK (class_year BETWEEN 1900 AND 2200),
  CONSTRAINT fk_draft_prospect_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS combined_measurement (
  measurement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id BIGINT NOT NULL,
  measurement_type measurement_type NOT NULL,
  combine_year SMALLINT NOT NULL CHECK (combine_year BETWEEN 1900 AND 2200),
  measured_on DATE,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  CONSTRAINT uq_combined_measurement UNIQUE (player_id, measurement_type, combine_year),
  CONSTRAINT fk_combined_measurement_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scouting_report (
  report_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id BIGINT NOT NULL,
  scout_id BIGINT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary TEXT NOT NULL,
  embedding vector(384),
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, summary)
  ) STORED,
  CONSTRAINT fk_scouting_report_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE RESTRICT,
  CONSTRAINT fk_scouting_report_scout
    FOREIGN KEY (scout_id) REFERENCES scout(person_id) ON DELETE RESTRICT,
  CONSTRAINT chk_scouting_report_embedding_metadata
    CHECK (embedding IS NULL OR (embedding_model IS NOT NULL AND embedded_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS injury_history (
  injury_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id BIGINT NOT NULL,
  injury_date DATE NOT NULL,
  description TEXT NOT NULL,
  severity injury_severity NOT NULL,
  CONSTRAINT fk_injury_history_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game (
  game_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id TEXT UNIQUE,
  game_date DATE NOT NULL,
  season SMALLINT NOT NULL CHECK (season BETWEEN 1900 AND 2200),
  home_team_id BIGINT NOT NULL,
  away_team_id BIGINT NOT NULL,
  CONSTRAINT fk_game_home_team
    FOREIGN KEY (home_team_id) REFERENCES team(team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_game_away_team
    FOREIGN KEY (away_team_id) REFERENCES team(team_id) ON DELETE RESTRICT,
  CONSTRAINT chk_game_different_teams CHECK (home_team_id <> away_team_id)
);

CREATE TABLE IF NOT EXISTS game_performance (
  performance_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id BIGINT NOT NULL,
  player_id BIGINT NOT NULL,
  team_id BIGINT NOT NULL,
  minutes NUMERIC NOT NULL CHECK (minutes BETWEEN 0 AND 70),
  points NUMERIC NOT NULL DEFAULT 0 CHECK (points >= 0),
  rebounds NUMERIC NOT NULL DEFAULT 0 CHECK (rebounds >= 0),
  assists NUMERIC NOT NULL DEFAULT 0 CHECK (assists >= 0),
  blocks NUMERIC NOT NULL DEFAULT 0 CHECK (blocks >= 0),
  steals NUMERIC NOT NULL DEFAULT 0 CHECK (steals >= 0),
  CONSTRAINT uq_game_performance_game_player UNIQUE (game_id, player_id),
  CONSTRAINT fk_game_performance_game
    FOREIGN KEY (game_id) REFERENCES game(game_id) ON DELETE RESTRICT,
  CONSTRAINT fk_game_performance_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE RESTRICT,
  CONSTRAINT fk_game_performance_team
    FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS news_article (
  article_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  publish_date DATE NOT NULL,
  summary TEXT NOT NULL,
  url TEXT UNIQUE,
  embedding vector(384),
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, title || '. ' || summary)
  ) STORED,
  CONSTRAINT chk_news_article_embedding_metadata
    CHECK (embedding IS NULL OR (embedding_model IS NOT NULL AND embedded_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS article_mention (
  article_id BIGINT NOT NULL,
  player_id BIGINT NOT NULL,
  PRIMARY KEY (article_id, player_id),
  CONSTRAINT fk_article_mention_article
    FOREIGN KEY (article_id) REFERENCES news_article(article_id) ON DELETE CASCADE,
  CONSTRAINT fk_article_mention_player
    FOREIGN KEY (player_id) REFERENCES player(player_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  record_key TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_by BIGINT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_audit_log_changed_by
    FOREIGN KEY (changed_by) REFERENCES person(person_id) ON DELETE SET NULL
);

-- B-tree indexes support joins and common relational filters. Search indexes
-- are GIN; HNSW is deliberately deferred to 08_vector_indexes.sql.
CREATE INDEX IF NOT EXISTS idx_person_phone_person ON person_phone(person_id);
CREATE INDEX IF NOT EXISTS idx_scout_person ON scout(person_id);
CREATE INDEX IF NOT EXISTS idx_analyst_person ON analyst(person_id);
CREATE INDEX IF NOT EXISTS idx_team_manager_team ON team_manager(team_id);
CREATE INDEX IF NOT EXISTS idx_team_need_team ON team_need(team_id);
CREATE INDEX IF NOT EXISTS idx_roster_team ON roster(team_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_roster ON roster_player(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_player ON roster_player(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_prospect_player ON draft_prospect(player_id);
CREATE INDEX IF NOT EXISTS idx_combined_measurement_player ON combined_measurement(player_id);
CREATE INDEX IF NOT EXISTS idx_scouting_report_player ON scouting_report(player_id);
CREATE INDEX IF NOT EXISTS idx_scouting_report_scout ON scouting_report(scout_id);
CREATE INDEX IF NOT EXISTS idx_scouting_report_search_vector ON scouting_report USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_injury_history_player ON injury_history(player_id);
CREATE INDEX IF NOT EXISTS idx_game_home_team ON game(home_team_id);
CREATE INDEX IF NOT EXISTS idx_game_away_team ON game(away_team_id);
CREATE INDEX IF NOT EXISTS idx_game_season ON game(season);
CREATE INDEX IF NOT EXISTS idx_game_performance_game ON game_performance(game_id);
CREATE INDEX IF NOT EXISTS idx_game_performance_player ON game_performance(player_id);
CREATE INDEX IF NOT EXISTS idx_game_performance_team ON game_performance(team_id);
CREATE INDEX IF NOT EXISTS idx_article_mention_player ON article_mention(player_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_changed_at ON audit_log(table_name, changed_at);
CREATE INDEX IF NOT EXISTS idx_news_article_search_vector ON news_article USING GIN(search_vector);
