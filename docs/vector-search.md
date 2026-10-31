# Phase 3C embeddings and retrieval evaluation

## Embedding pipeline

`scripts/embed.ts` uses the shared `embedText` implementation and the
`Xenova/all-MiniLM-L6-v2` model from `lib/embeddings/config.ts`. The model
returns normalized 384-dimensional vectors. The script processes missing
rows in batches (`--batch-size`, default 16), embedding:

- `scouting_report.summary`
- `news_article.title || '. ' || news_article.summary`

Each update stores the vector with `pgvector`'s `toSql` helper, the configured
model name, and `embedded_at = now()`. Rows are updated only if their embedding
is still null and their source text has not changed since it was read. A
failed run leaves already completed rows intact; rerunning only fills rows
still missing vectors.

## HNSW indexes

After backfilling, `db/postgres/08_vector_indexes.sql` creates idempotent HNSW
indexes using `vector_cosine_ops`, with `m = 16` and `ef_construction = 64`.
The partial indexes contain only non-null embeddings. They are intentionally
separate from the initial schema so they can be built after data is embedded.

## Retrieval evaluation

`scripts/eval-retrieval.ts` reads the generated report IDs, archetype labels,
and matching queries from `db/seed/reports.json`. For each archetype query, it
embeds the query with the same model, retrieves the five nearest reports by
cosine distance with `hnsw.ef_search = 100`, and calculates precision@5 from
the JSON labels. Labels are not stored in PostgreSQL or included in report
text. The check passes only if at least 3 of the top 5 reports match each
archetype (at least 60% precision for every query); otherwise it exits
unsuccessfully and reports which archetypes missed the threshold.

## Run Phase 3C

Set `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, and `PG_DATABASE` in `.env`.
Run this after the schema, real-data import, and Phase 3B supporting-data
generation:

```powershell
npm run embed -- --missing
npm run vector:indexes
npm run eval:retrieval
```

`npm run seed:phase3c` runs the same three steps in order. The first run may
download the embedding model. The evaluation's exact report IDs must match the
current generated report rows; rerun Phase 3B text generation before Phase 3C
if those reports have been regenerated. The index command applies the SQL
through the application database pool, so it uses the same `PG_*` variables
loaded from `.env` as the embedding and evaluation scripts.
