# DraftBoard: Scouting & Draft Decision Support (DBMS Level 3 Project)

> This file is the single source of truth for the project. Codex: read it fully before every task.
> Work on ONE phase at a time (see "Phases"). After each phase: run the checks listed, commit, stop.

## 1. What we are building

A web app for a basketball franchise's scouting department. The current scope is **NBA Player Scouting and Team
Recruitment**: scouts search and filter existing NBA players, analyse historical performance and physical attributes,
compare players, match players against team requirements, and search scouting reports and news by meaning.

Draft functionality is a documented **future extension**. The existing `draft_prospect` table and practical related
schema decisions are retained, but the current work does not import prospects or implement draft workflows.

This is deliberately NOT plain CRUD. The active non-CRUD features are:
1. Team-need-to-player matching score (database function + view).
2. **Semantic search (pgvector)** over scouting report summaries and news articles, combined with relational filters (hybrid query).
3. Keyword full-text search (tsvector + GIN) next to semantic search, so both can be compared in the demo.
4. Role-based dashboards (Admin, Scout, Analyst, Team Manager).

The existing atomic draft/roster-signing design remains documented for the future extension, but is not part of the
current Phase 3 implementation or current scouting workflow.

## 2. Fixed decisions (do not change without asking)

| Concern | Choice |
|---|---|
| Frontend + API | Next.js (App Router, TypeScript), Route Handlers under `app/api/**` |
| Database | **PostgreSQL 16 + pgvector** (one database for relational AND vector data) |
| DB driver | `pg` (node-postgres) with raw SQL, NO ORM; `pgvector` npm package for vector param helpers |
| Embedding model | `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`, run locally, **384 dimensions**, normalized output |
| Similarity metric | **Cosine distance** (`<=>` operator, `vector_cosine_ops`); similarity = `1 - distance` |
| Vector index | **HNSW** (`USING hnsw (embedding vector_cosine_ops)`), created in `08_vector_indexes.sql` only |
| Auth | JWT in httpOnly cookie (`jose`), passwords hashed with `bcryptjs` |
| Validation | `zod` at the API layer AND constraints at the DB layer |
| UI | Tailwind CSS, plain components (no heavy UI kit), charts with **Recharts** |
| Scripts / tests | `tsx` to run TypeScript scripts, `dotenv` to load `.env` in scripts, `vitest` for tests |
| Bulk import | `psql \copy` into staging tables + SQL transforms (no extra libraries) |
| Infra | `docker-compose.yml` using image `pgvector/pgvector:pg16` |
| VCS | Git, small commits, conventional messages (`feat:`, `fix:`, `docs:`, `db:`) |

Raw SQL is intentional: the course grades DDL, DML, views, triggers, functions. An ORM hides all of that.
There is no MongoDB or Neo4j in this project. Do not add them.

## 3. Rules for Codex

- Never hard-code credentials. Read everything from `process.env`. Commit `.env.example`, never `.env`.
- All SQL lives in `db/postgres/*.sql` (schema, views, functions, triggers, seed) and `db/import/*.sql` (real-data import). Application code only calls them.
- Use parameterized queries (`$1, $2`) always. No string-concatenated SQL.
- Every API route: validate input (zod) -> check auth + role -> call DB helper -> return JSON `{ ok, data | error }`.
- Role checks happen in the backend (middleware + per-route), not only in the UI.
- Business integrity goes in the DB (constraints, triggers, transactions), not only in JS.
- Keep the DB pool in `lib/db/pg.ts`. Routes never create their own connections.
- **Audit user:** any API write that touches an audited table runs inside a transaction that first executes
  `SELECT set_config('app.current_user_id', $1, true)` (transaction-local), so triggers can fill `audit_log.changed_by`.
- **Embedding rules:**
  - Dimension, model name and metric are constants in ONE file: `lib/embeddings/config.ts`. The SQL schema dimension must match.
  - Use the same model and normalization for stored documents and for search queries. Never mix models.
  - Embeddings are computed in application code (`lib/embeddings/embed.ts`), never in SQL.
  - Pass vectors to Postgres with the `pgvector` helper (`toSql`) and cast with `::vector`.
  - Save `embedding_model` and `embedded_at` next to every embedding.
  - If embedding fails when a report/article is created, still save the row with `embedding = NULL` and let `scripts/embed.ts --missing` backfill it. Never lose the user's data because of the embedding step.
- In `next.config`, set `serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'sharp']` and load the model once (module-level singleton), not per request.
- After changing schema, update `docs/data-dictionary.md`.
- Do not add libraries not listed in section 2 without saying why.
- Real data (Kaggle) and generated data must be distinguishable and documented (see Phase 3 and `docs/data-sources.md`).

## 4. Repo structure

```
/
├─ AGENTS.md
├─ README.md                  # setup + run instructions (graded)
├─ docker-compose.yml
├─ .env.example
├─ dataset/                   # local source CSVs: Nathan Lauga NBA and Draft Combine (gitignored)
├─ db/
│  ├─ postgres/
│  │  ├─ 00_extensions.sql    # CREATE EXTENSION vector
│  │  ├─ 01_schema.sql        # CREATE TABLE, types, constraints, B-tree + GIN indexes (NOT the HNSW index)
│  │  ├─ 02_alter_demo.sql    # ALTER / DROP demonstrations
│  │  ├─ 03_views.sql
│  │  ├─ 04_functions.sql     # functions / procedures (PL/pgSQL)
│  │  ├─ 05_triggers.sql
│  │  ├─ 06_seed.sql          # synthetic data only (persons, needs, current-season rosters, etc.)
│  │  ├─ 07_queries.sql       # showcase queries (JOIN/GROUP BY/HAVING/subquery/FTS/vector)
│  │  └─ 08_vector_indexes.sql  # HNSW indexes, created after embeddings are loaded
│  ├─ import/
│  │  ├─ 00_staging.sql       # staging tables mirroring the raw CSV columns
│  │  ├─ 01_load.sql          # \copy commands
│  │  ├─ 02_transform.sql     # cleaning + INSERT ... SELECT into real tables
│  │  └─ mapping.md           # CSV column -> table column mapping and cleaning rules
│  └─ seed/
│     ├─ reports.json         # generated scouting report texts (output of scripts/generate-text.ts)
│     └─ articles.json        # generated news articles
├─ scripts/
│  ├─ generate-text.ts        # builds reports/articles from real stats + archetype vocabulary
│  ├─ embed.ts                # embed rows (all, or --missing only)
│  ├─ embedding-spike.ts      # Phase 0 check: embed a sentence, print dimension
│  └─ eval-retrieval.ts       # retrieval quality check against archetype labels
├─ app/
│  ├─ (auth)/login/
│  ├─ dashboard/              # role-based
│  ├─ players/  teams/  games/
│  ├─ reports/  news/  search/  team-match/
│  └─ api/**                  # Route Handlers
├─ lib/
│  ├─ db/pg.ts
│  ├─ embeddings/{config.ts,embed.ts}
│  ├─ auth/{jwt.ts,guard.ts}
│  ├─ positions.ts            # allowed position values (must match the SQL type)
│  └─ validators/*.ts
├─ tests/                     # API + SQL + retrieval test cases
└─ docs/
   ├─ er-diagram.png  relational-schema.md  data-dictionary.md  data-sources.md
   ├─ db-justification.md  vector-search.md  architecture.md
   ├─ queries.md  test-results.md  screenshots/
```

## 5. ER -> relational mapping (decisions already made)

Entities and fixes to the ER diagram (apply these, they are corrections, not suggestions).
Use `BIGINT GENERATED ALWAYS AS IDENTITY` for surrogate keys; use `CREATE TYPE ... AS ENUM` or CHECK constraints for fixed value sets.
Tables that receive real imported data (`team`, `player`, `game`) also get `external_id TEXT UNIQUE` (the dataset's own ID), so imports are idempotent and traceable.

- **Person** + IS-A (Scout, Analyst, Team Manager, Admin): use *table-per-subtype*.
  `person(person_id PK, f_name, l_name, dob, email UNIQUE, password_hash, role person_role NOT NULL, street, city, state, zip, UNIQUE(person_id, role))`.
  Subtype tables share the PK/FK and carry a fixed role column so a subtype row can only exist for the matching role:
  `scout(person_id PK, role person_role NOT NULL DEFAULT 'scout' CHECK (role = 'scout'), experience, FOREIGN KEY (person_id, role) REFERENCES person(person_id, role))`,
  same pattern for `analyst(person_id, role, specialization)`, `team_manager(person_id, role, team_id FK -> team)`, `admin(person_id, role)`.
  `person.role` is an **intentional denormalization used by auth** (one lookup, no joins at login). To stop it drifting out of sync
  (a "scout" with no scout row), add a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `person` that, at commit, checks the matching subtype row exists.
  Create a person and its subtype row in ONE transaction.
  The diagram duplicates city in both Person and Address: keep ONE address (street, city, state, zip).
  Add `email` and `password_hash` (needed for auth, missing from the ER diagram). Ignore the unclear "Ifeoid" attribute.
- **Phone Number** is multivalued: `person_phone(person_id FK, phone_number, PK(person_id, phone_number))`.
- **Team**: `team(team_id PK, external_id, team_name UNIQUE, city)`.
- **Team Need** (Team 1:N Team Need): `team_need(need_id PK, team_id FK, position, priority SMALLINT CHECK 1..5, description, is_filled BOOLEAN DEFAULT false)`.
- **Roster** (Team 1:N Roster; Roster N:M Player):
  `roster(roster_id PK, team_id FK, season, is_historical BOOLEAN NOT NULL DEFAULT false, UNIQUE(team_id, season), UNIQUE(roster_id, season))`.
  `is_historical = true` for rosters built from imported real data (no size cap enforced); `false` for rosters managed in the app.
- **Roster membership** (junction): `roster_player(roster_id, player_id FK, season, PK(roster_id, player_id), UNIQUE(player_id, season), FOREIGN KEY (roster_id, season) REFERENCES roster(roster_id, season))`.
  `season` is denormalized from the roster on purpose: the composite FK guarantees it always matches the roster's season, and
  `UNIQUE(player_id, season)` makes it **impossible for a player to be on two teams' rosters in the same season** (this is what stops double-drafting across teams).
  Simplification, documented in `docs/data-dictionary.md`: a traded player has ONE roster row per season (the team they played the most games for);
  their real per-game team is kept in `game_performance.team_id`.
- **Player**: `player(player_id PK, external_id, f_name, l_name, dob NULL, height_cm NULL, weight_kg NULL, position player_position NULL, secondary_position player_position NULL)`
  with `CHECK (height_cm IS NULL OR height_cm BETWEEN 150 AND 240)`, `CHECK (weight_kg IS NULL OR weight_kg BETWEEN 45 AND 200)`,
  `CHECK (secondary_position IS NULL OR secondary_position <> position)`. Source data has gaps, so these columns are nullable.
  Position set: PG, SG, SF, PF, C. The real combine data also uses hybrid labels (SG-SF, PF-C, ...), about 30% of rows:
  the import maps the FIRST label to `position` and the second to `secondary_position`. Team-need matching uses `position` only (players with NULL position are excluded from matching). The draft board remains a future extension.
  If the position set ever changes, change it in ONE place (`01_schema.sql`) plus `lib/positions.ts`, and record it in `db/import/mapping.md`.
- **Draft Prospect** IS-A Player: `draft_prospect(prospect_id PK, player_id UNIQUE FK, college NULL, class_year SMALLINT NOT NULL)`.
  This table is retained for the future draft extension. Current Phase 3 does **not** populate it, does not import
  combine-only prospects, and does not invent colleges for real players.
- **Combined Measurement** (Player 1:N): `combined_measurement(measurement_id PK, player_id FK, measurement_type, combine_year SMALLINT NOT NULL, measured_on DATE NULL, value NUMERIC NOT NULL, unit TEXT NOT NULL, UNIQUE(player_id, measurement_type, combine_year))`.
  The combine file only has a year, so `measured_on` stays NULL (never fabricate a date). `measurement_type` is restricted by a CHECK or enum to the types in `db/import/mapping.md`.
  Real combine data is wide (one column per test); the import unpivots it into this one-row-per-measurement shape and skips NULL values (no row for a missing test).
- **Scouting Report** (Player 1:N, also FK to scout):
  `scouting_report(report_id PK, player_id FK, scout_id FK, report_date, summary TEXT NOT NULL, embedding vector(384), embedding_model TEXT, embedded_at TIMESTAMPTZ, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', summary)) STORED)`.
  Indexes in `01_schema.sql`: GIN on `search_vector`. The HNSW index on `embedding` is created ONLY in `08_vector_indexes.sql`, after embeddings are loaded.
- **Injury History** (Player 1:N): `injury_history(injury_id PK, player_id FK, injury_date, description, severity injury_severity)`. Severities: minor, moderate, severe. Plain text, not embedded.
- **Game**: `game(game_id PK, external_id, game_date, season, home_team_id FK, away_team_id FK, CHECK(home_team_id <> away_team_id))`.
- **Game Performance**: the diagram shows Game 1:1 Game Performance, which is wrong. Correct cardinality is
  **Game 1:N and Player 1:N**, so:
  `game_performance(performance_id PK, game_id FK, player_id FK, team_id FK, minutes NUMERIC CHECK (minutes BETWEEN 0 AND 70), points, rebounds, assists, blocks, steals, UNIQUE(game_id, player_id), CHECKs >= 0)`.
  `team_id` is the team the player played for in that game (needed for real data with traded players); a trigger checks it is the game's home or away team.
  The minutes cap is 70 (not 48) because overtime games exceed 48 minutes.
- **News Article** (moved into Postgres, no longer a separate store):
  `news_article(article_id PK, title, publish_date, summary TEXT NOT NULL, url, embedding vector(384), embedding_model TEXT, embedded_at TIMESTAMPTZ, search_vector tsvector GENERATED ... STORED)`.
  GIN index in `01_schema.sql`; HNSW index in `08_vector_indexes.sql` only.
- **MENTIONS** (News Article M : N Player): junction `article_mention(article_id FK, player_id FK, PK(article_id, player_id))`.
- **Audit Log** (not in the ER diagram; supports the audit trigger):
  `audit_log(audit_id PK, table_name TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')), record_key TEXT NOT NULL, old_data JSONB, new_data JSONB, changed_by BIGINT NULL REFERENCES person(person_id) ON DELETE SET NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
  Written only by trigger functions. `changed_by` comes from `current_setting('app.current_user_id', true)` (NULL for scripts/imports). Index on `(table_name, changed_at)`.

Use `ON DELETE` rules deliberately (e.g. `CASCADE` for roster_player and article_mention, `RESTRICT` for a player referenced by performances) and document why in `docs/data-dictionary.md`.

## 6. Vector search design

Document all of this in `docs/vector-search.md` (the rubric asks for each item).

**Why vectors (justification for `db-justification.md`):** scouting summaries and news are free text. Scouts describe the same
skill in different words ("elite rim protector", "shot-blocking big who anchors the paint"), so keyword/`LIKE` search misses
matches. Embeddings let users search by meaning. Everything else (people, teams, rosters, stats, measurements) is strictly
structured and stays relational with full integrity.

| Question | Answer |
|---|---|
| What is embedded? | `scouting_report.summary` and `news_article.title || '. ' || summary` |
| Model | `all-MiniLM-L6-v2` (384-d), local, via transformers.js, mean pooling + normalize |
| How stored | `vector(384)` column in the same row as the text, with `embedding_model` and `embedded_at` |
| Metric | Cosine distance (`<=>`); vectors are normalized |
| Index | HNSW, `vector_cosine_ops` (tune `m`, `ef_construction`; set `hnsw.ef_search` at query time) |
| Retrieval | Embed the query with the same model, `ORDER BY embedding <=> $query LIMIT k`, return similarity = `1 - distance` |

Features to implement:
1. **Semantic report search:** `GET /api/search/reports?q=...&position=&maxInjurySeverity=` — hybrid query:
   vector similarity on `scouting_report` JOIN `player` with relational filters in the same SQL statement.
2. **Similar reports / "scouts who wrote like this":** given a `report_id`, return its nearest neighbours (excluding itself).
3. **Similar players (text-based):** average or best-match report similarity per player to suggest comparable NBA players.
4. **News relevance:** given a player, return semantically related news (plus exact mentions from `article_mention`).
5. **Keyword vs semantic comparison page:** same query, two result columns (tsvector FTS vs pgvector). This is the demo moment that justifies the vector DB.

## 7. Phases (give Codex one at a time)

### Phase 0: Scaffold + embedding spike (do this first, it is the riskiest part)
Create Next.js TS app, Tailwind, folder structure, `docker-compose.yml` (`pgvector/pgvector:pg16`), `.env.example`
(`PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE, JWT_SECRET`), `lib/db/pg.ts` pool, `lib/embeddings/{config,embed}.ts`,
`scripts/embedding-spike.ts` (embeds two sentences, prints dimension and their cosine similarity), `/api/health` that pings Postgres and checks `vector` extension exists.
**Done when:** `docker compose up -d`, `npm run dev`, `/api/health` ok, spike prints dimension 384, and an embedding call works from inside a Next.js Route Handler (not only from the script).
If the model does not load inside Next.js, fall back to running embeddings in `scripts/` only (backfill style) and call a small local helper for query embeddings. Do NOT change the database.

### Phase 1: Schema (DDL)
Write `00_extensions.sql` and `01_schema.sql` following section 5 exactly: PKs, FKs (including the composite FKs), UNIQUE (including `UNIQUE(player_id, season)`), CHECK, NOT NULL, DEFAULT, enum types, `external_id` columns, `audit_log`, indexes on FK and search columns, generated tsvector columns + GIN. No HNSW here.
Write `02_alter_demo.sql` (a few real ALTERs, e.g. add column, add index, modify constraint, and one DROP of a throwaway table/index).
Write `docs/relational-schema.md` and `docs/data-dictionary.md` (include the simplifications: one roster row per player-season, nullable dob/height/weight, denormalized `person.role`, `roster_player.season`).
**Done when:** scripts run clean on an empty DB, in order, twice (provide a reset script that drops and recreates the schema), and inserting the same player into two rosters of the same season fails.

### Phase 2: Views, functions, triggers
- Views: `v_player_profile` (player + latest measurements + injury count), `v_team_open_needs`, `v_prospect_board` (prospect + avg stats + latest report).
- Functions/procedures (PL/pgSQL):
  - `fn_match_prospects_for_team(team_id)`: scores prospects against open needs (position match weighted by need priority, penalty for severe injuries, bonus from measurements). Returns ranked rows. Skips prospects already on a roster for the target season.
  - `sp_draft_prospect_to_roster(prospect_id, roster_id)`: locks the prospect's player row with `SELECT ... FOR UPDATE`, inserts into `roster_player` (copying `season` from the roster), marks the matching team need as filled, and catches `unique_violation` on `UNIQUE(player_id, season)` to raise a readable "already on a roster this season" error. Any failure raises an exception so the whole transaction rolls back. The database constraint is the real guard against double-drafting; the lock and the check only make the error friendly and avoid races.
  - `fn_player_efficiency(player_id)`: simple (points + rebounds + assists + steals + blocks) per minute.
- Triggers (trigger function + trigger):
  - Roster size cap of 15 `BEFORE INSERT` on `roster_player`, enforced only when `roster.is_historical = false`.
  - `game_performance.team_id` must be the game's home or away team (the 0-70 minutes rule is a plain CHECK, not a trigger).
  - `audit_log` filled on INSERT/UPDATE/DELETE of `roster_player` (old/new rows as JSONB, `changed_by` from `app.current_user_id`).
  - Constraint trigger (deferred) keeping `person.role` consistent with its subtype row.
  - Clear `embedding`, `embedding_model` and `embedded_at` when `summary` is updated (so stale vectors are never served).
**Done when:** each object has a test call in `07_queries.sql` and a failing-case demo (trigger fires, transaction rolls back, double-draft rejected, 71 minutes rejected, 69 accepted).

### Phase 3: NBA scouting data, supporting data, and embeddings

**Active scope boundary:** Phase 3 serves NBA Player Scouting and Team Recruitment. The `draft_prospect` table and
existing draft database objects remain in the schema for a future extension, but Phase 3 must not populate
`draft_prospect`, import the Draft Like a Pro dataset, or implement draft workflows.

#### Phase 3A: Real NBA data import (Nathan Lauga + Draft Combine)

**Source of each table:**

| Table(s) | Source |
|---|---|
| team, player, game, game_performance, historical rosters (from player-season team) | **Nathan Lauga NBA dataset**, restricted to a documented recent-season subset |
| combined_measurement and safely matched player physical attributes | **Draft Combine Kaggle dataset** |
| draft_prospect | Not populated in the current scope; reserved for the future draft extension |

**Real-data import (`db/import/`):**
1. Read the local source CSVs from `dataset/` (gitignored). Record each dataset name, URL, licence, files used, and the selected season range in `docs/data-sources.md`.
2. `00_staging.sql`: staging tables mirroring the raw CSV columns (all `TEXT`). `01_load.sql`: `\copy` into staging.
3. `02_transform.sql`: clean and load real tables with idempotent `external_id` values (`ON CONFLICT DO NOTHING`). Record every rule in `mapping.md`:
   - split full names into `f_name` / `l_name`; convert combine inches to `height_cm` and `wingspan_cm`, pounds to `weight_kg`, and `MM:SS` game minutes to numeric minutes; missing values and `NA` become `NULL`;
   - map position labels to the allowed set, using the first hybrid label as `position` and the second as `secondary_position`;
   - unpivot wide combine columns into `combined_measurement` rows and skip missing, derived, and sparse measurements according to `mapping.md`;
   - for each player-season choose the team with the most games for the historical roster, while retaining the true game team in `game_performance.team_id`;
   - set imported rosters to `is_historical = true` and drop games outside the selected seasons;
   - **player identity:** every real NBA player receives exactly one project-owned `player_id`; use Nathan Lauga player, team, and game IDs as `external_id` values where available. Match Draft Combine rows to NBA players only when normalized names are unique in both sources, suffixes (Jr., II) are preserved, and the debut-season plausibility check passes. Write every unmatched or ambiguous combine row to `import_unmatched`; never guess.
4. Create `player` rows from NBA box-score/player rows in the selected seasons. Attach combine positions, physical attributes, and measurements only to safely matched existing NBA players. Do not create combine-only players or `draft_prospect` rows; log skipped and unmatched combine rows.
5. Keep volume manageable by importing only the selected seasons and players meeting a documented minimum-games threshold or having a safely matched combine record.
6. Do not fabricate injury histories for real players. `injury_history` remains empty unless a documented real injury source is introduced later.

#### Phase 3B: Synthetic supporting data

Synthetic data is limited to application-supporting records, never a substitute for NBA performance or measurement data:

- `person` and subtype rows, passwords, team needs, and app-managed current-season rosters in `06_seed.sql`;
- generated scouting reports, news articles, and `article_mention` rows in `scripts/generate-text.ts`, derived from imported real NBA statistics and safely matched measurements;
- no fabricated injury histories.

Define approximately eight player archetypes from real statistics and measurements (for example, rim protector,
sharpshooter, playmaking guard, two-way wing, slasher, stretch big, defensive stopper, and raw athlete). Generate at
least 120 reports and 60 articles from varied vocabulary and real values. The archetype label is used only by
`eval-retrieval.ts`, never stored in the database. Spot-check at least 20 generated texts and clearly label them as
generated—not real scouting or news material—in `docs/data-sources.md` and the demo.

#### Phase 3C: Embeddings and retrieval evaluation

`scripts/embed.ts` embeds rows with `embedding IS NULL` in batches and updates `embedding`, `embedding_model`, and
`embedded_at` idempotently. Then run `08_vector_indexes.sql`. `scripts/eval-retrieval.ts` must show that, for each
archetype query (for example, "athletic rim protector who blocks shots"), most top-five reports share that archetype.

**Done when:** `npm run seed` runs schema, the Phase 3A import, Phase 3B supporting-data generation, and Phase 3C
embedding/index steps; the import report lists unmatched records; showcase queries return non-trivial NBA-player
results; no `draft_prospect` rows are created; and retrieval evaluation meets the documented threshold.

### Phase 4: Showcase SQL queries
In `07_queries.sql`, at least: multi-table JOIN, GROUP BY + HAVING (players averaging > X points), ORDER BY + LIMIT,
correlated subquery, `IN`/`EXISTS` subquery, a CTE or window function (rank players per position), FTS (`@@ plainto_tsquery`),
a pure vector query, and a **hybrid query** (vector ordering + relational filters + JOIN in one statement).
Also show `EXPLAIN ANALYZE` with and without the HNSW index. Document each in `docs/queries.md` with purpose + sample output.

### Phase 5: Auth + roles
`POST /api/auth/login`, `/logout`, `GET /api/auth/me`; JWT httpOnly cookie, middleware and per-route role checks.
- **admin**: manage persons, teams and all application data.
- **scout**: read players and search; create and edit only their own reports.
- **analyst**: view analytics and search; record measurements, injuries and performances.
- **team_manager**: manage only their own team's needs and roster and run Team Match for that team.
**Done when:** unauthorized roles receive 403 and a manager cannot access another team's protected operations.

### Phase 6: Core API
Route Handlers cover players, teams, needs, rosters, games, performances, measurements, injuries, reports, news, people, dashboards, Team Match, the SQL showcase and section 6 vector and keyword search. `GET /api/team-match?teamId=` uses `fn_match_players_for_team`; admin may select a team and managers are restricted to their own. API roster writes run in transactions with `app.current_user_id` set for auditing. Reports and articles are saved before embedding; failures leave them pending for backfill. Validate inputs and map DB errors to readable responses. Prospects and drafting remain future work; no draft API is part of the active scope.

### Phase 7: UI
Login, role-aware navigation and dashboards; paginated player list and detail; reports; games and analytics; teams, needs and rosters; Team Match with score breakdown; semantic search and keyword comparison; and news. Managers see their own team and admins can select a team. Clearly label generated content. Phase 2/4/6 features should be reachable within their intended permissions; draft/prospect workflows are future work.

### Phase 8: Tests
`tests/` (vitest) with: SQL tests (constraint violation, trigger fires, transaction rollback, function output, same player in two rosters of one season rejected,
`person.role` / subtype consistency enforced, 70 minutes accepted and 71 rejected, audit_log row written with `changed_by`),
API tests (auth, role denial, validation errors),
vector tests (dimension is 384, query returns k results ordered by similarity, filters are respected, stale embedding cleared on summary edit, retrieval eval from Phase 3 meets a threshold),
import tests (row counts match the source subset, no orphan foreign keys, unmatched-row report generated).
Record results in `docs/test-results.md`.

### Phase 9: Docs + polish
Complete all `docs/*` (especially `vector-search.md`, `db-justification.md`, `data-sources.md`), README (prereqs, `docker compose up`, where to download the Kaggle CSVs, run SQL scripts in order, `npm run seed`, env vars, demo credentials, first-run model download note, `npm run dev`), architecture diagram, screenshots.

## 8. Requirement checklist (map to the assignment)

| Requirement | Where it is satisfied |
|---|---|
| ER diagram + relational schema | `docs/er-diagram.png`, `docs/relational-schema.md` |
| DDL: CREATE/ALTER/DROP, keys, constraints, indexes, views | `db/postgres/00-03` |
| DML: INSERT/UPDATE/DELETE/SELECT + JOIN/GROUP BY/HAVING/subquery | API routes + `07_queries.sql` |
| 4+ advanced SQL concepts | transactions (with row locking), triggers, functions/procedures, views, indexing (HNSW/GIN/B-tree), full-text search |
| 1+ NoSQL/Vector concept | Vector similarity search with pgvector (plus hybrid queries) |
| Vector documentation: what is embedded, model, storage, metric, retrieval | `docs/vector-search.md` |
| Next.js UI | Phase 7 |
| Backend/API + env vars | Phase 0, 6 |
| Auth, 2+ roles | Phase 5 (4 roles) |
| DB-level validation + integrity | CHECK/FK/UNIQUE (incl. one roster per player-season), triggers, transactions, audit log |
| Docs, Git/README, demo, tests | Phase 8, 9 |
| Not just CRUD | Team Match scoring, audited roster transactions, semantic + hybrid search |
| DB choice justified per data type | `docs/db-justification.md` (structured -> relational constraints; free text -> embeddings) |
| Real-world data, clearly sourced | `docs/data-sources.md` (real vs generated per table) |

## 9. Team split (2 members, both must touch DB and app)

- **Member A:** Phases 1, 2, 4 (schema, views/functions/triggers, queries) + backend routes for players, rosters, Team Match; auth.
- **Member B:** Phase 0 embedding spike, Phase 3 (Kaggle import, text generation, embedding pipeline, retrieval eval), vector/search routes, UI pages.
- Both: review each other's PRs, write tests for own features, split docs. Use feature branches and PRs so commits show individual contribution.

## 10. Demo script (order)

1. ER diagram and the corrections (Person address, multivalued phone, Game-Performance cardinality, auth fields, news moved into SQL with a mentions junction, audit log).
2. Data sources: what is real (Kaggle) and what is generated, and why.
3. Run schema + import, show tables and constraints failing on bad input (double roster, 71 minutes).
4. Show a view, a function result, a trigger firing, an audit_log row, a transaction rollback.
5. Show a `vector(384)` column, the HNSW index, `EXPLAIN ANALYZE`, and one hybrid query.
6. Live app: log in as scout to create a report, then as team manager to inspect own needs, roster and ranked Team Match results. Drafting is a future extension.
7. Semantic search page: show a query where keyword search misses and semantic search hits.
8. Show tests and git history by author.

## 11. Known risks and fallbacks

- **Embedding model will not load inside Next.js:** run embeddings from `scripts/` only and use a small local helper process for query embeddings. Keep the database as is.
- **Search results look random:** the generated text is the problem, not the database. Improve archetype variety and re-run `eval-retrieval.ts`.
- **Stale vectors:** handled by the trigger that clears the embedding when the summary changes, plus `embed.ts --missing`.
- **Kaggle files use different IDs:** match by name only as a last resort, log ambiguous rows, and restrict to one dataset family where possible.
- **Import is slow or huge:** restrict seasons and minimum games played; load with `\copy`, not INSERT scripts.
