# DraftBoard Phase 1 data dictionary

## Conventions

- Primary keys are identity-backed `BIGINT` values unless a junction table uses a composite key.
- Foreign keys use restrictive deletion when historical facts would be damaged, and cascade when a row has no independent meaning without its parent.
- Nullable `dob`, `height_cm`, and `weight_kg` reflect gaps in source data; missing values are not fabricated.
- Embedding metadata is nullable because Phase 3 may save text before embedding succeeds. If an embedding is present, its model and timestamp are required by a check constraint.

## Types

| Type | Values | Purpose |
|---|---|---|
| `person_role` | `admin`, `scout`, `analyst`, `team_manager` | Auth and subtype identity |
| `player_position` | `PG`, `SG`, `SF`, `PF`, `C` | Primary and secondary positions |
| `injury_severity` | `minor`, `moderate`, `severe` | Injury classification |
| `measurement_type` | height, weight, wingspan, standing reach, vertical, bench, agility, sprint, shuttle | Controlled combine measurement names |

## Tables

### `team`

| Column | Type | Rules / meaning |
|---|---|---|
| `team_id` | `BIGINT` | Identity primary key |
| `external_id` | `TEXT` | Optional source-system ID; unique for idempotent import |
| `team_name` | `TEXT` | Required and unique |
| `city` | `TEXT` | Required city |
| `abbreviation` | `TEXT` | Added by the Phase 1 ALTER demonstration; optional 2–5 uppercase characters |

### `person`, subtype tables, and `person_phone`

`person` stores identity, login email, password hash, role, and one address. `role` is intentionally denormalized for one-step auth lookup. `UNIQUE(person_id, role)` allows subtype tables to require the matching role. `scout`, `analyst`, `team_manager`, and `admin` share the parent key. `team_manager.team_id` identifies the manager's team. `person_phone` handles the multivalued phone attribute with `(person_id, phone_number)` as its primary key.

The subtype foreign keys cascade when a person is deleted because subtype rows cannot exist independently. A manager's team is restricted from deletion while referenced.

### `team_need`

Stores a team's requested position, priority from 1 (lowest) to 5 (highest), description, and fill state. It cascades on team deletion. Phase 2 matching uses open needs and priority.

### `roster` and `roster_player`

`roster` has one row per team and season, with `is_historical` distinguishing imported historical rosters from app-managed rosters. `roster_player` is the membership junction. Its `season` is deliberately duplicated and protected by the composite foreign key. `UNIQUE(player_id, season)` enforces the one-roster-per-player-per-season rule, which is the database-level guard against double-drafting. A traded player is simplified to one roster row for the team they played the most games for; per-game team truth remains in `game_performance.team_id`.

Roster deletion cascades to memberships. Player deletion is restricted while membership exists.

### `player` and `draft_prospect`

`player` stores one project-owned identity for each real player. `external_id` preserves the source identity. Position is nullable; hybrid source labels are mapped later to primary and secondary enum values. Height must be 150–240 cm and weight 45–200 kg when present. Secondary position cannot equal primary position. `draft_prospect` is the player subtype used for the draft pool and has an optional college plus class year.

Prospect deletion cascades to its subtype row, while player deletion is restricted by historical performance/report references.

### `combined_measurement`

Stores the unpivoted one-row-per-player/test/year shape. `measured_on` remains nullable because the combine source provides a year but not necessarily an exact date. The uniqueness rule prevents duplicate measurements of the same type for one player and combine year. Measurements cascade with the player.

### `scouting_report`

Stores a report for a player written by a scout. `summary` is the source text. `embedding vector(384)`, `embedding_model`, and `embedded_at` support Phase 3 indexing. `search_vector` is generated from the summary and indexed with GIN for keyword search. The player and scout foreign keys restrict deletion to preserve authored scouting history.

### `injury_history`

Stores dated plain-text injuries and severity. It cascades with the player because it is a dependent history owned by that player.

### `game` and `game_performance`

`game` identifies a fixture, season, home team, and away team. A check prevents a team from playing itself. `external_id` supports idempotent imports. `game_performance` is correctly modeled as Game 1:N and Player 1:N, not Game 1:1. It stores minutes (0–70 for overtime), nonnegative box-score statistics, and the team represented in the game. The `(game_id, player_id)` unique key allows one performance row per player per game. The Phase 2 trigger enforces that `team_id` is one of the game's participants.

Game and performance deletion is restricted to preserve imported facts; team deletion is also restricted when games or performances reference it.

### `news_article` and `article_mention`

News is stored in PostgreSQL rather than a separate store. The title and summary produce a generated GIN-backed keyword vector. The future embedding represents `title || '. ' || summary` and has 384 dimensions. `article_mention` models the many-to-many relationship between articles and players. Mentions cascade when an article is deleted; player deletion is restricted while an article mentions that player.

### `audit_log`

Stores table name, action, record key, old/new JSONB, optional `changed_by`, and timestamp. The user is set by the API transaction through `app.current_user_id`; the Phase 2 roster-membership audit trigger populates it. Deleting a person sets `changed_by` to NULL so audit history remains.

## Index policy

Foreign-key and common filter columns receive B-tree indexes. `scouting_report.search_vector` and `news_article.search_vector` receive GIN indexes. HNSW indexes on embedding columns are intentionally excluded from Phase 1 and belong only in `08_vector_indexes.sql` after embeddings are loaded.
