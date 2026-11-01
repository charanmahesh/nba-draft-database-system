# DraftBoard

DraftBoard is a scouting and team-recruitment database project. Real NBA
statistics and safely matched combine measurements are imported separately
from synthetic application-supporting demo data.

## macOS setup

Install Docker Desktop (`brew install --cask docker`), open it and wait for it to run. Install Node and the PostgreSQL client with `brew install node libpq && brew link --force libpq`; put `/opt/homebrew/opt/libpq/bin` first on PATH if another client takes precedence.

Copy `.env.example` to `.env`, set the PostgreSQL values and generate `JWT_SECRET` with `openssl rand -hex 32`. Use port 5433 if 5432 is occupied. Never commit `.env`.

Place the CSVs listed in [data sources](docs/data-sources.md) in `dataset/`, then run:

```bash
docker compose up -d
npm install
npm run seed
npm run dev
```

`npm run seed` **resets the database**, imports the local CSVs, generates synthetic text, downloads the embedding model on first use, embeds and indexes the texts, and evaluates retrieval. Check `/api/health` and run `npm run embedding:spike` to verify the setup. Existing PowerShell scripts remain available for individual phases.

## Phase 3B supporting data

After applying the schema and Phase 2 database objects, configure `psql` with
the PostgreSQL connection environment variables (`PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, and `PGDATABASE`). From the repository root, run the Phase 3A
import followed by the Phase 3B seed:

```powershell
.\scripts\import-phase3a.ps1
.\scripts\seed-phase3b.ps1
```

This seeds demo accounts, team needs, and empty app-managed current-season
rosters, then generates 120 scouting reports and 60 news-style demo articles
from the imported NBA statistics and safely matched measurements. The generated
texts are explicitly labeled synthetic and are not real scouting reports or
news. JSON output, including the report evaluation labels, is written to
`db/seed/`.

Local demo accounts all use the password `DraftBoardDemo!2026`:

| Role | Email |
| --- | --- |
| Admin | `admin@draftboard.local` |
| Scout | `scout@draftboard.local` |
| Analyst | `analyst@draftboard.local` |
| Team manager | `manager@draftboard.local` |

These are local demonstration credentials, not production credentials.

## Phase 3C embeddings

After Phase 3B has generated its reports and articles, run the missing-vector
backfill, create the HNSW indexes, and evaluate retrieval:

```powershell
npm run seed:phase3c
```

This embeds report summaries and article titles plus summaries using the
configured 384-dimensional local model, creates the cosine HNSW indexes, and
checks top-five retrieval for each report archetype. The evaluation exits with
an error if any archetype has fewer than three matching reports in its top
five. For individual steps, see [docs/vector-search.md](./docs/vector-search.md).

For the Phase 6 API acceptance matrix, start two local development servers against the same seeded database: `npm run dev -- -p 3020` and `NEXT_DIST_DIR=.next-fail EMBEDDING_FORCE_FAIL=1 npm run dev -- -p 3021`. Then run `DEMO_PASSWORD='<demo password>' TEST_BASE_URL=http://localhost:3020 TEST_FAIL_BASE_URL=http://localhost:3021 npm run check:api`. The failure flag works only outside production. The check invokes `npm run embed -- --missing`, which backfills all pending documents in the configured database, and cleans up its own fixtures.

### Isolated database, vector and import tests

Run `npm test` with the `PG_*` connection values configured in `.env` and PostgreSQL 16 with pgvector available. The configured PostgreSQL user must have `CREATEDB` permission and permission to install the `vector` extension. Vitest creates two uniquely named `draftboard_test_<pid>_<random>` databases: one for deterministic SQL and generated-report vector fixtures, and one for a real-data import. It applies the project schema, runs the documented `psql` staging/load/transform pipeline into the import database, and drops only those databases after the run. It does not reset or seed the configured development database. An interrupted process may leave test databases behind; inspect them before removing them. Install `psql` and place the five documented CSVs in `dataset/` before running the full suite. Vector tests use the local MiniLM model and may download it on first use.
