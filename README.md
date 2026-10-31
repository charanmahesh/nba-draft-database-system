# DraftBoard

DraftBoard is a scouting and team-recruitment database project. Real NBA
statistics and safely matched combine measurements are imported separately
from synthetic application-supporting demo data.

## Phase 0 setup

1. Copy `.env.example` to `.env` and fill in the PostgreSQL and JWT values.
2. Start PostgreSQL with pgvector:

   ```bash
   docker compose up -d
   ```

3. Install dependencies and run the embedding spike:

   ```bash
   npm install
   npm run embedding:spike
   ```

   The first embedding run downloads `Xenova/all-MiniLM-L6-v2` locally and prints two 384-dimensional embeddings' cosine similarity.
4. Start Next.js and open `/api/health`:

   ```bash
   npm run dev
   ```

The health route checks both the PostgreSQL connection and the `vector` extension.

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
