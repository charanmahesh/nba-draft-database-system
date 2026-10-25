# DraftBoard

Phase 0 scaffold for the DraftBoard scouting and draft decision-support system.

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

The health route checks both the PostgreSQL connection and the `vector` extension. No schema scripts are included yet; those belong to Phase 1.
