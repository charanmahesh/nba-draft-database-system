# DraftBoard: Scouting & Draft Decision Support (DBMS Level 3 Project)

> This file is the single source of truth for the project. Codex: read it fully before every task.
> Work on ONE phase at a time (see "Phases"). After each phase: run the checks listed, commit, stop.

## 1. What we are building

A web app for a basketball franchise's scouting department. Scouts record reports on players and draft prospects,
analysts compare measurements and game stats, team managers track roster and positional needs, and the system
**recommends prospects that match a team's open needs**, lets users **search scouting reports and news by meaning**,
and runs the draft/roster-signing workflow safely.

This is deliberately NOT plain CRUD. The non-CRUD features are:
1. Need-to-prospect matching score (database function + view).
2. Draft pick / roster signing as an atomic transaction with integrity triggers, row locking and a database-enforced "one roster per player per season" rule.
3. **Semantic search (pgvector)** over scouting report summaries and news articles, combined with relational filters (hybrid query).
4. Keyword full-text search (tsvector + GIN) next to semantic search, so both can be compared in the demo.
5. Role-based dashboards (Admin, Scout, Analyst, Team Manager).

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
├─ data/raw/                  # downloaded Kaggle CSVs (gitignored; README says where to get them)
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
│  ├─ players/  prospects/  teams/  rosters/  games/
│  ├─ reports/  news/  search/  draft-board/
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
  the import maps the FIRST label to `position` and the second to `secondary_position`. Draft board and team needs use `position` only (players with NULL position are excluded from matching).
  If the position set ever changes, change it in ONE place (`01_schema.sql`) plus `lib/positions.ts`, and record it in `db/import/mapping.md`.
- **Draft Prospect** IS-A Player: `draft_prospect(prospect_id PK, player_id UNIQUE FK, college NULL, class_year SMALLINT NOT NULL)`.
  `college` is NOT in the combine file; leave it NULL unless a second source or the synthetic seed fills it (do not invent real colleges for real players).
  A drafted prospect is later added to a roster through the draft transaction.
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
1. **Semantic report search:** `GET /api/search/reports?q=...&position=&classYear=&maxInjurySeverity=` — hybrid query:
   vector similarity on `scouting_report` JOIN `player` / `draft_prospect` with relational filters in the same SQL statement.
2. **Similar reports / "scouts who wrote like this":** given a `report_id`, return its nearest neighbours (excluding itself).
3. **Similar prospects (text-based):** average or best-match report similarity per player to suggest comparable prospects.
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

### Phase 3: Data: real Kaggle subset + synthetic remainder + embeddings
**Source of each table:**

| Table(s) | Source |
|---|---|
| team, player, game, game_performance, combined_measurement, draft_prospect (draft/combine data), historical rosters (from player-season team) | **Real Kaggle data**, subset of the last 5 to 10 seasons |
| person + subtypes, team_need, current-season rosters (`is_historical = false`), injury_history (unless the dataset has injuries), users/passwords | **Synthetic** (`06_seed.sql`) |
| scouting_report text, news_article text, article_mention | **Generated from the real stats** (`scripts/generate-text.ts`) |

**Real-data import (`db/import/`):**
1. Put the CSVs in `data/raw/` (gitignored). Record dataset name, URL, licence and which files are used in `docs/data-sources.md`.
2. `00_staging.sql`: staging tables mirroring the CSV columns (all TEXT). `01_load.sql`: `\copy` into staging.
3. `02_transform.sql`: cleaning and `INSERT ... SELECT` into the real tables, idempotent via `external_id` (`ON CONFLICT DO NOTHING`). Rules (write each into `mapping.md`):
   - split full names into `f_name` / `l_name`; convert heights (feet-inches or inches) to `height_cm` and weights to `weight_kg`; missing values become NULL;
   - map position labels to the allowed set;
   - unpivot wide combine columns into `combined_measurement` rows; **the combine file follows `db/import/mapping.md`, section A** (name format "Last, First", inches/pounds converted to cm/kg, `NA` as NULL, hybrid positions, derived and sparse columns skipped);
   - for each player-season pick one team (most games played) for the roster row; keep the true team per game in `game_performance.team_id`;
   - set `roster.is_historical = true` for imported rosters; drop players/games outside the chosen seasons;
   - **player identity:** every real person gets exactly one `player_id` (our own surrogate key); `external_id` records where it came from. Use the dataset's own player ID where a file has one. When matching by name (combine <-> box scores), follow `mapping.md`: auto-link only names that are unique in BOTH files, keep suffixes (Jr., II) in the key, never link a combine class 2023+ row to a box-score player, apply the debut-season plausibility check, and write every unmatched or ambiguous row to `import_unmatched` instead of guessing.
4. Keep volume manageable: only seasons in scope, and only players with at least a minimum number of games or a combine record.
5. **Which players get created, and who is a prospect** (see `mapping.md` for the matching rules):
   - Create a `player` row for (a) every box-score player in the chosen seasons and (b) every combine player from classes 2023-2026.
     Attach combine measurements and position/height/weight to any combine player from classes before 2023 that safely matches a created player (see `mapping.md`); skip the other pre-2023 combine rows and log the count.
     Rows from classes 2023-2026 always become their own players and are never linked to a box-score player, even if a veteran has the same name.
     (Veterans from classes 2000-2016 still appear in recent box scores, which is why ALL combine years are loaded into staging.)
   - `draft_prospect` rows exist only for combine classes 2023-2026 (about 278 players, none of them has NBA box-score rows in the file, which ends in April 2023). They are the pool shown on the draft board.
     Earlier classes are ordinary `player` rows with measurements.

**Generated text (`scripts/generate-text.ts`):**
- Derive each player's archetype from REAL stats and measurements (e.g. high blocks per minute + large height/wingspan -> rim protector; high assists -> playmaking guard; etc.). Define ~8 archetypes (rim protector, sharpshooter, playmaking guard, two-way wing, slasher, stretch big, defensive stopper, raw athlete).
- Build 120+ scouting reports and 60+ news articles from vocabulary pools per archetype with varied sentence structures, inserting the player's real numbers (averages, measurements). Articles mention several real players (fills `article_mention`).
- The archetype label is used ONLY by `eval-retrieval.ts`, never stored in the DB. Spot-check at least 20 generated texts by reading them.
- State clearly in `docs/data-sources.md` and the demo that these texts are generated, not real scouting material.

**Embeddings:** `scripts/embed.ts` embeds all rows with `embedding IS NULL`, in batches, updating `embedding`, `embedding_model`, `embedded_at`. Idempotent. Then run `08_vector_indexes.sql`.
**Done when:** `npm run seed` runs schema + import + synthetic seed + text generation + embedding, the import report lists any unmatched rows, showcase queries return non-trivial results, and `scripts/eval-retrieval.ts` shows that for each archetype query (e.g. "athletic rim protector who blocks shots") most of the top 5 reports share that archetype.

### Phase 4: Showcase SQL queries
In `07_queries.sql`, at least: multi-table JOIN, GROUP BY + HAVING (players averaging > X points), ORDER BY + LIMIT,
correlated subquery, `IN`/`EXISTS` subquery, a CTE or window function (rank players per position), FTS (`@@ plainto_tsquery`),
a pure vector query, and a **hybrid query** (vector ordering + relational filters + JOIN in one statement).
Also show `EXPLAIN ANALYZE` with and without the HNSW index. Document each in `docs/queries.md` with purpose + sample output.

### Phase 5: Auth + roles
`POST /api/auth/login`, `/logout`, `GET /api/auth/me`. JWT cookie, `middleware.ts` protecting `/dashboard` and `/api/**`.
`lib/auth/guard.ts`: `requireRole(['admin','scout'])`.
Permissions:
- **admin**: manage persons, teams, everything.
- **scout**: create/edit own scouting reports, view players/prospects, use search.
- **analyst**: record measurements, game performances, view all analytics and search.
- **team_manager**: manage own team's needs and roster, run the draft function, view the draft board for own team only.
**Done when:** a scout gets 403 on the draft route; a manager cannot touch another team's roster.

### Phase 6: Core API
Route Handlers for players, prospects, teams, needs, rosters, games, performances, measurements, injuries, reports, news,
`GET /api/draft-board?teamId=` (calls `fn_match_prospects_for_team`), `POST /api/draft` (explicit `BEGIN`/`COMMIT`/`ROLLBACK` around the draft procedure, with `app.current_user_id` set),
and the vector endpoints from section 6 plus `GET /api/search/keyword?q=`.
When a report or article is created or its summary edited: save the row, embed, update the vector (follow the failure rule in section 3).
All inputs zod-validated; DB errors (constraint/trigger) mapped to readable 4xx messages.

### Phase 7: UI
Login page, role-aware sidebar, and:
- Dashboard per role (cards + Recharts charts: top performers, open needs, recent reports).
- Players / Prospects tables with filter, sort, pagination (real data is large, paginate in SQL); player detail page (measurements, injuries, reports, related news, stat chart).
- Scouting report form (embedding status shown: "indexed" / "pending").
- Draft board page: ranked prospects for the manager's team with score breakdown and a "Draft" button.
- **Semantic search page** with filters (position, class year, injury severity), similarity score on each result, and the keyword-vs-semantic side-by-side comparison.
- News feed with player filter and "related articles".
**Done when:** every phase 2/4/6 feature is reachable from the UI.

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
| Not just CRUD | draft board scoring, draft transaction, semantic + hybrid search |
| DB choice justified per data type | `docs/db-justification.md` (structured -> relational constraints; free text -> embeddings) |
| Real-world data, clearly sourced | `docs/data-sources.md` (real vs generated per table) |

## 9. Team split (2 members, both must touch DB and app)

- **Member A:** Phases 1, 2, 4 (schema, views/functions/triggers, queries) + backend routes for players, rosters, draft; auth.
- **Member B:** Phase 0 embedding spike, Phase 3 (Kaggle import, text generation, embedding pipeline, retrieval eval), vector/search routes, UI pages.
- Both: review each other's PRs, write tests for own features, split docs. Use feature branches and PRs so commits show individual contribution.

## 10. Demo script (order)

1. ER diagram and the corrections (Person address, multivalued phone, Game-Performance cardinality, auth fields, news moved into SQL with a mentions junction, audit log).
2. Data sources: what is real (Kaggle) and what is generated, and why.
3. Run schema + import, show tables and constraints failing on bad input (double roster, 71 minutes).
4. Show a view, a function result, a trigger firing, an audit_log row, a transaction rollback.
5. Show a `vector(384)` column, the HNSW index, `EXPLAIN ANALYZE`, and one hybrid query.
6. Live app: login as scout, then as team manager, run the draft board and draft a prospect.
7. Semantic search page: show a query where keyword search misses and semantic search hits.
8. Show tests and git history by author.

## 11. Known risks and fallbacks

- **Embedding model will not load inside Next.js:** run embeddings from `scripts/` only and use a small local helper process for query embeddings. Keep the database as is.
- **Search results look random:** the generated text is the problem, not the database. Improve archetype variety and re-run `eval-retrieval.ts`.
- **Stale vectors:** handled by the trigger that clears the embedding when the summary changes, plus `embed.ts --missing`.
- **Kaggle files use different IDs:** match by name only as a last resort, log ambiguous rows, and restrict to one dataset family where possible.
- **Import is slow or huge:** restrict seasons and minimum games played; load with `\copy`, not INSERT scripts.
