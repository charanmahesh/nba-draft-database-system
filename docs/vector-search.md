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
and standard queries from `db/seed/reports.json`, plus a second paraphrased query set in the evaluation script. For each query, it
embeds the query with the same model, retrieves the five nearest reports by
cosine distance with `hnsw.ef_search = 100`, and calculates precision@5 from
the JSON labels. Labels are not stored in PostgreSQL or included in report
text. The check passes only if at least 3 of the top 5 reports match each
archetype in each set (at least 60% precision for every query); otherwise it exits
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

## Demo queries

These results were recorded after the 2026-11-01 seed, using `plainto_tsquery('english', query)` against report `search_vector` and cosine nearest-neighbour order for the same reports. Relevance means the generated report's JSON archetype label, not an independent scouting assessment. The generated language was tuned using evaluation feedback, so these examples are selected demonstrations, not an unbiased benchmark. Each keyword list below is complete; the vector list is the top five, in order. IDs may change after a seed.

| Query and target | Keyword results | Vector results (report ID: player) |
| --- | --- | --- |
| `protects the basket from opposing layups` (rim protector) | none | 14: John Henson; 5: Mitchell Robinson; 11: Jarrett Allen; 6: Kristaps Porzingis; 9: DeMarcus Cousins |
| `facilitator who sets up teammates` (playmaking guard) | none | 32: Trae Young; 35: LeBron James; 43: D'Angelo Russell; 31: John Wall; 34: Russell Westbrook |
| `lockdown perimeter defender` (defensive stopper) | none | 100: John Wall; 97: Robert Covington; 94: Kris Dunn; 105: Gary Harris; 103: Darren Collison |

The role assignments are statistical proxies: three-point makes and attempts come from the imported staging box scores; position, points, assists, steals, blocks and safely matched measurements inform the remaining rankings. In particular scoring volume cannot establish driving ability, steals cannot establish individual defense, and combine testing cannot establish an athlete's development level. Report language states these limitations; film and richer tracking data are needed for actual scouting. The same player can appear in several archetypes. These are generated demonstrations, not real scouting reports.

## Phase 6 search endpoints

Authenticated users can call `GET /api/search/reports?q=...&k=5&position=PG&maxInjurySeverity=moderate` for cosine-ranked reports with both optional relational filters applied in the same query. A maximum severity excludes any player with an injury above that severity; players without recorded injuries remain eligible. `GET /api/search/keyword?q=...&k=5` returns report full-text matches, `ts_rank` and `ts_headline`. Treat headlines as untrusted text when rendering them.

`GET /api/reports/:id/similar?k=5` excludes the source report. `GET /api/players/:id/similar?k=5` ranks other players by the best report-pair similarity. `GET /api/players/:id/news?k=5` returns all exact `mentions` newest first, and up to k semantic `related` articles ordered by similarity, excluding mentions. A player without embedded reports has no semantic results. All endpoints accept `k` from 1 to 100 and return fewer results when fewer are available. Only embeddings from the configured model are compared.

## Metric and failure behavior

Search embeds the query with the same model and normalization as stored documents. PostgreSQL orders by cosine distance `embedding <=> query` and exposes similarity as `1 - distance` (larger means closer); results are semantic neighbours, not calibrated probabilities. Hybrid position and injury predicates are applied alongside the vector ordering in one SQL statement. HNSW is approximate, so recall can depend on `hnsw.ef_search`; evaluation uses 100. Full-text search instead uses the generated English `tsvector`, `plainto_tsquery`, `ts_rank`, and `ts_headline`. It matches lexemes, not meaning.

An insert or text edit is saved before the embedding attempt. If embedding fails, the response reports `pending`, the row remains available, and the missing-vector backfill can retry. Report summary edits and article title or summary edits clear all embedding metadata in triggers; stale vectors are not returned. The development-only `EMBEDDING_FORCE_FAIL=1` flag exercises this path and is ignored in production.
