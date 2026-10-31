# Phase 4 SQL showcase

Run the schema, Phase 2 objects, Phase 3A import, Phase 3B supporting-data
generation, and Phase 3C embedding/index steps before the complete showcase.
In particular, the vector examples expect report embeddings and the HNSW
index to exist. From the repository root, run:

```powershell
psql -v ON_ERROR_STOP=1 -f db/postgres/07_queries.sql
```

The file first runs read-only showcase statements and then the existing Phase
2 acceptance transaction, which creates temporary fixtures and rolls them
back. The acceptance block also relies on the Phase 2 triggers and functions.

## Query catalog

| # | SQL concept | Purpose |
| --- | --- | --- |
| 1 | Multi-table `JOIN` | Displays real NBA game-level player output with position, season, date, and the team the player represented in that game. The `external_id LIKE 'nba:%'` filter keeps the result set scoped to imported games. |
| 2 | `GROUP BY` + `HAVING` | Finds players with at least 10 imported game appearances and an average of at least 20 points per game. |
| 3 | `ORDER BY` + `LIMIT` | Shows the 10 highest scoring player averages in the imported game sample. |
| 4 | Correlated subquery | Compares each player's average points against the average of player-level scoring averages for that same position. |
| 5 | `EXISTS` subqueries | Returns players who have both scouting reports and imported NBA appearances, without multiplying rows from either relationship. |
| 6 | CTE + window function | Ranks players within each position by points average and returns the top three at each position. |
| 7 | Full-text search | Uses `plainto_tsquery` against the generated `scouting_report.search_vector` and ranks keyword matches with `ts_rank_cd`. The terms are chosen from the generated reports' common statistics language. |
| 8 | Pure vector similarity | Uses cosine distance (`<=>`) to find the reports nearest to an existing embedded report, excluding the anchor itself. Similarity is shown as `1 - distance`. |
| 9 | Hybrid query | Uses the same-position report as an anchor, filters candidates to that position and embedding model, and ranks the joined reports by vector similarity in one query. |
| 10–11 | `EXPLAIN ANALYZE` | Runs the same nearest-neighbor query once with the report HNSW index temporarily removed (then rolled back) and once with the index available. |

## Representative output

The result values depend on the imported subset and generated reports. These
are output shapes, not captured measurements from a particular database run.

**Query 1 — joined game performances**

| player_id | f_name | l_name | position | season | team_name | minutes | points |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: |
| 101 | Example | Player | SG | 2019 | Example City Example | 31.5 | 22 |

**Query 2 — players meeting the scoring threshold**

| player_id | f_name | l_name | position | games_played | avg_points |
| ---: | --- | --- | --- | ---: | ---: |
| 102 | Example | Scorer | SF | 42 | 24.31 |

**Query 4 — above-position-average scorers**

| position | player_id | f_name | l_name | avg_points |
| --- | ---: | --- | --- | ---: |
| PG | 103 | Example | Guard | 21.08 |

**Query 6 — top players within position**

| position | position_rank | player_id | f_name | l_name | games_played | avg_points |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| C | 1 | 104 | Example | Center | 38 | 18.42 |

**Query 7 — keyword report matches**

| report_id | f_name | l_name | keyword_rank | summary |
| ---: | --- | --- | ---: | --- |
| 201 | Example | Player | 0.1 | Generated demo scouting text ... |

**Query 9 — hybrid nearest reports**

| report_id | player_id | position | cosine_similarity |
| ---: | ---: | --- | ---: |
| 202 | 105 | SG | 0.82 |

On an empty, unimported, or not-yet-embedded database, result sets can be
empty. The vector examples need at least one embedded report; the HNSW
comparison needs the Phase 3C index.

## Comparing vector query plans

Queries 10 and 11 in `07_queries.sql` run `EXPLAIN (ANALYZE, BUFFERS)` for the
same nearest-neighbor ordering:

- Query 10 temporarily drops the report HNSW index inside a transaction, runs
  the plan, and rolls back. The index is restored automatically.
- Query 11 runs with the Phase 3C HNSW index present and sequential scans
  discouraged so the planner considers the HNSW path.
- The planner setting is reset immediately afterward.

Inspect the actual plan node, `Execution Time`, shared buffer counts, and
whether the HNSW index appears. PostgreSQL may still prefer a sequential scan
for a small table; disabling sequential scans is a planner preference, not an
absolute guarantee. Query 10 uses transactional DDL and briefly takes a table
lock, so run the comparison only on the demo database without concurrent
application traffic. Do not compare invented timings: capture the output from
the database used for the demo, since timings depend on data volume and
hardware.

The Phase 2 acceptance transaction at the end of `07_queries.sql` is kept
separate from these read-only showcase queries and ends with `ROLLBACK`.
