# DraftBoard viva notes: phase decisions and build approach

This document is the speaking guide for explaining the project in a viva. It records both the architectural decisions and the implementation approach. A phase marked **planned** describes the approved design in `AGENTS.md`; it must not be presented as implemented until that phase is completed and tested.

## One-minute project explanation

DraftBoard is a scouting and draft decision-support application for a basketball franchise. PostgreSQL stores structured entities and enforces business integrity. pgvector stores embeddings beside scouting and news text so the application can perform semantic search. Next.js provides the UI and API route handlers, while raw SQL exposes the database work required by the DBMS project: constraints, views, functions, triggers, transactions, indexes, full-text search, and vector search.

## Phase 0 — scaffold and embedding spike — implemented

### Decisions

- Use Next.js App Router with TypeScript and Route Handlers under `app/api`.
- Use PostgreSQL through the `pg` pool; do not introduce an ORM.
- Use `pgvector/pgvector:pg16` for the future database container.
- Use `Xenova/all-MiniLM-L6-v2` locally through Transformers.js. The model produces normalized 384-dimensional vectors.
- Keep model name, dimension, and cosine metric together in `lib/embeddings/config.ts` so application and database design have one source of truth.
- Load the embedding pipeline through a module-level singleton so requests do not reload the model.
- Keep credentials in environment variables and commit only `.env.example`.

### Build approach

The scaffold provides the Next.js runtime, Tailwind/PostCSS configuration, environment template, Compose service, pooled database client, embedding helper, and the required folder structure. The embedding spike embeds two related sentences and computes their dot product; because both vectors are normalized, that dot product is cosine similarity. The `/api/embedding` route proves the same embedding code works inside a Next.js Route Handler. The `/api/health` route checks the database connection and whether the `vector` extension is installed.

### Viva evidence

- TypeScript and production build passed.
- The spike returned two vectors of dimension 384 and a cosine similarity.
- The embedding Route Handler returned dimension 384.
- Docker/PostgreSQL could not be started in the development environment because Docker was unavailable; the health route correctly returned an unavailable response.

## Phase 1 — relational schema — implemented

### Decisions

- Use PostgreSQL tables, foreign keys, checks, enums, generated columns, and indexes for structured data.
- Use `BIGINT GENERATED ALWAYS AS IDENTITY` for surrogate keys.
- Use table-per-subtype for `person`, `scout`, `analyst`, `team_manager`, and `admin`.
- Keep `person.role` as intentional auth denormalization, protected by a deferred consistency trigger.
- Store phones in a separate multivalued junction table.
- Use composite foreign keys and `UNIQUE(player_id, season)` to enforce one roster per player per season.
- Keep nullable player measurements because source data has gaps.
- Store both GIN-backed generated `tsvector` columns and nullable `vector(384)` columns, but create HNSW only after embeddings are loaded.
- Store news in PostgreSQL and model mentions with an article/player junction table.

### Build approach

Create `00_extensions.sql` first, then `01_schema.sql` with all types, tables, constraints, indexes, and generated search columns. Keep demonstrations of `ALTER` and `DROP` in `02_alter_demo.sql`. The reset and acceptance scripts apply the schema twice, reset it, apply it again, and attempt to insert one player into two teams' rosters for one season.

### Viva explanation

The database is not just persistence: constraints protect relationships and prevent invalid states even if a client or API is buggy. The roster membership season is deliberately duplicated because a composite foreign key keeps it synchronized with the roster while the unique constraint prevents double-drafting.

## Phase 2 — views, functions, and triggers — planned

### Decisions

- Put reusable read logic in views: player profiles, open team needs, and the prospect board.
- Put prospect matching, draft execution, and player efficiency in database functions/procedures.
- Use row locking and a database unique constraint for safe draft concurrency.
- Put roster size, game-team validity, audit logging, role/subtype consistency, and stale-embedding cleanup in triggers.

### Build approach

Write PL/pgSQL functions in `04_functions.sql` and trigger functions/triggers in `05_triggers.sql`. The draft procedure locks the player, copies the roster season, inserts membership, marks a matching need filled, and lets any failure roll back the transaction. The audit trigger reads `app.current_user_id` from a transaction-local setting. Updating report text clears its embedding metadata so stale vectors cannot be served.

### Viva explanation

Application validation improves user experience, but database validation is the final authority. Row locking handles races, while the unique constraint remains the real protection against two teams acquiring the same player in a season.

## Phase 3 — real data, synthetic data, and embeddings — planned

### Decisions

- Use a documented Kaggle subset for teams, players, games, performances, measurements, prospects, and historical rosters.
- Use synthetic seed data for users, roles, current rosters, needs, and injuries where real data is unavailable.
- Generate scouting reports and news from real statistics, but label them clearly as generated text rather than real scouting material.
- Load raw CSVs into all-text staging tables with `psql \\copy`, then transform with SQL.
- Use external IDs for idempotent imports and log ambiguous/unmatched player identity matches instead of guessing.
- Never link combine classes 2023–2026 to box-score veterans; those classes become the draft prospect pool.

### Build approach

The import pipeline is staging → cleaning/identity matching → relational inserts. Wide combine data is unpivoted into measurement rows, missing values are skipped, and unit conversions are documented. Text generation derives archetypes from real stats and measurements, creates varied report/article text, and records enough metadata for retrieval evaluation without storing the archetype label in the database. The embedding script fills missing vectors in batches and is idempotent.

### Viva explanation

This split preserves provenance: real facts remain distinguishable from synthetic users and generated narrative text. The import is repeatable because source identifiers and conflict handling prevent duplicate rows.

## Phase 4 — showcase SQL — planned

### Decisions

Demonstrate the DBMS syllabus directly: joins, grouping and `HAVING`, ordering and limiting, correlated and `IN`/`EXISTS` subqueries, CTE/window functions, keyword full-text search, pure vector search, hybrid search, and `EXPLAIN ANALYZE`.

### Build approach

Keep executable examples in `07_queries.sql` and explain their purpose and sample output in `docs/queries.md`. The hybrid query performs vector ordering and relational filtering in one SQL statement, showing why structured and semantic retrieval belong together.

## Phase 5 — authentication and roles — planned

### Decisions

- Use JWTs in httpOnly cookies and bcryptjs password hashes.
- Enforce roles in middleware and each backend route, not only in the UI.
- Support admin, scout, analyst, and team manager permissions.

### Build approach

Implement login, logout, and current-user routes. Centralize authorization in `lib/auth/guard.ts`. A team manager is additionally restricted to their own team, and a scout must receive 403 for draft actions. Passwords and JWT secrets always come from environment variables.

## Phase 6 — core API — planned

### Decisions

- Use raw parameterized SQL through the shared pool.
- Follow the same route sequence everywhere: validate with zod → authenticate/authorize → call database helper → return `{ ok, data | error }`.
- Wrap audited writes in a transaction that sets `app.current_user_id` locally.
- Save report/article text even if embedding fails; mark the vector pending for later backfill.

### Build approach

Build route handlers for the core entities, draft board, draft transaction, keyword search, semantic search, similar reports/prospects, and related news. Convert database constraint and trigger failures into readable client errors. Use the pgvector `toSql` helper and `::vector` casts for vector parameters.

## Phase 7 — UI — planned

### Decisions

- Use plain Tailwind components and Recharts; avoid a heavy UI kit.
- Make the UI role-aware but never rely on it for authorization.
- Show keyword and semantic search side by side to make the vector feature demonstrable.

### Build approach

Implement login, role dashboards, paginated player/prospect tables, detail pages, report forms with embedding status, the manager draft board, semantic search filters, keyword comparison, and related-news views. Pagination belongs in SQL because the real dataset can be large.

## Phase 8 — tests — planned

### Decisions

Test the database as a source of truth, not only the HTTP layer. Cover constraints, triggers, rollback, role consistency, audit attribution, vector dimensions/order/filtering, stale-vector cleanup, retrieval quality, import counts, and orphan detection.

### Build approach

Use Vitest for API, SQL, vector, retrieval, and import tests. Record commands, environment assumptions, pass/fail results, and any unavailable infrastructure in `docs/test-results.md`.

## Phase 9 — documentation and polish — planned

### Decisions

Make the project reproducible and explainable: README setup, data provenance, database justification, architecture, vector-search rationale, schema dictionary, query explanations, test results, and screenshots.

### Build approach

Complete the documentation only after the implementation and tests reflect the final behavior. The demo should move from ER corrections and data provenance to constraints, database functions/triggers, vector indexes and hybrid queries, role-based workflow, and the semantic-search comparison.

## Cross-phase principles to repeat in the viva

1. Structured facts need relational constraints; free text benefits from embeddings.
2. The API validates early, but PostgreSQL enforces business integrity finally.
3. Raw SQL is intentional because the project demonstrates database concepts directly.
4. Every embedding uses the same model, dimension, normalization, and cosine metric.
5. Real, synthetic, and generated data are explicitly separated and documented.
6. Each phase is completed with checks and a small conventional Git commit before the next phase begins.
