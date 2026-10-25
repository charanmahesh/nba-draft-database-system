# DraftBoard relational schema

Phase 1 defines the PostgreSQL relational foundation. The application uses one database for business data, keyword search vectors, and future pgvector embeddings. `00_extensions.sql` enables pgvector; `01_schema.sql` creates types, tables, constraints, and B-tree/GIN indexes; `02_alter_demo.sql` demonstrates repeatable DDL changes; `reset.sql` recreates the connected database's `public` schema.

## Relationship map

```text
team 1---N team_need
team 1---N roster 1---N roster_player N---1 player
person 1---1 scout / analyst / team_manager / admin
player 1---N combined_measurement
player 1---N scouting_report N---1 scout
player 1---N injury_history
team 1---N game (home and away roles)
game 1---N game_performance N---1 player
news_article N---N player through article_mention
person 1---N audit_log (changed_by, nullable)
```

## Main design decisions

- All surrogate keys use `BIGINT GENERATED ALWAYS AS IDENTITY`.
- Fixed value sets use PostgreSQL enums: `person_role`, `player_position`, `injury_severity`, and `measurement_type`.
- `person` uses table-per-subtype. The `(person_id, role)` unique key lets subtype foreign keys require both identity and matching role. The deferred consistency trigger is intentionally a Phase 2 object.
- `roster_player.season` is intentionally denormalized. Its composite foreign key to `(roster_id, season)` ensures it agrees with the roster, while `UNIQUE(player_id, season)` prevents the same player appearing on two teams in one season.
- `game_performance` is a many-to-many bridge between games and players with statistics. `team_id` preserves the team the player represented in that game; Phase 2 adds the trigger that checks it is the game's home or away team.
- `search_vector` is a stored generated `tsvector` with a GIN index. Vector columns are `vector(384)`, but no HNSW index is created in Phase 1.
- `audit_log` is present as the destination for a Phase 2 audit trigger. Phase 1 does not write audit rows automatically.

## DDL demonstrations

`02_alter_demo.sql` adds the optional team abbreviation, adds its format check and index, and creates/drops a scratch table and index. The statements are repeatable so the full Phase 1 sequence can be run twice after a reset.

## Running the Phase 1 sequence

PowerShell scripts read PostgreSQL connection settings from the normal `psql` environment (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`):

```powershell
./scripts/reset-db.ps1
./scripts/apply-phase1.ps1
./scripts/apply-phase1.ps1
./scripts/reset-db.ps1
./scripts/apply-phase1.ps1
```

`phase1-check.ps1` performs the complete acceptance sequence in one command. It uses `ON_ERROR_STOP=1`, so any SQL error stops the check immediately.
