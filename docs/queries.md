# Phase 4 showcase queries

Run `db/postgres/07_queries.sql` from the repository root after `npm run seed`, with `psql -v ON_ERROR_STOP=1 -f db/postgres/07_queries.sql` and the standard PostgreSQL connection variables set. The samples below were captured on 2026-11-01 from the imported 2017–2019 NBA seasons, 120 generated report summaries and their model-generated vectors. Reports are synthetic; player statistics are imported. Results, report IDs and timings can change after reseeding. The file also includes Phase 2 acceptance fixtures, which run inside a transaction and roll back.

The following numbers match the numbered statements in `07_queries.sql`; the complete executable SQL is there.

| # | Purpose and SQL concept | Short sample output |
| --- | --- | --- |
| 1 | **Multi-table JOIN** connects players, their game performances, games and teams to show game context. | 2020-10-11: LeBron James, Los Angeles Lakers, 28 points, 14 rebounds, 10 assists. |
| 2 | **GROUP BY + HAVING** finds players with at least 10 appearances and at least 20 points per game in the selected sample. | James Harden: 274 games, 32.72 points/game; 30 players returned. |
| 3 | **ORDER BY + LIMIT** lists the ten highest scoring averages among players with at least 10 games. | Harden 32.72, Giannis Antetokounmpo 27.50, LeBron James 26.92. |
| 4 | **Correlated subquery** compares each eligible player's scoring average with the mean of player averages at the same recorded position. Players without positions are excluded. | PG Damian Lillard 26.60 and Stephen Curry 26.47; 132 players returned. |
| 5 | **EXISTS subqueries** select players who have both a generated report and an imported NBA game appearance. | Eric Bledsoe, Darren Collison, Stephen Curry; first 20 returned. |
| 6 | **CTE and window function** rank players by scoring average within their recorded position; `ROW_NUMBER` returns the top three per position, with deterministic tie-breaks. | PG: Lillard 26.60, Curry 26.47, Kyrie Irving 23.90; 15 rows total. |
| 7 | **Full-text search** uses `search_vector @@ plainto_tsquery('english', 'points rebounds assists')`, ranked by `ts_rank_cd`. | Report 41, De'Aaron Fox, rank 0.03214; report 35, LeBron James, 0.03167. |
| 8 | **Pure vector similarity** orders reports by cosine distance `<=>` from the first stored, model-embedded report, excludes the anchor, and restricts the model to the anchor's model. The player join supplies a name. | Report 4 Hassan Whiteside, similarity 0.93468; report 13 Daniel Gafford, 0.92341. |
| 9 | **Hybrid search** combines a model-embedded report anchor, a JOIN to player, an exact position filter, and vector-distance ordering in one statement. | Anchor position PF; Daniel Gafford 0.92341, John Henson 0.85033. |
| 10 | **EXPLAIN ANALYZE without HNSW** drops the report index inside a transaction, runs the vector query, then rolls back the drop. | Sequential scan and top-N sort; 0.353 ms in this run. |
| 11 | **EXPLAIN ANALYZE with HNSW available**, default planner settings. | Planner still chose sequential scan and top-N sort; 0.330 ms. |
| 12 | **EXPLAIN ANALYZE with sequential scans discouraged** demonstrates the available HNSW index. | `Index Scan using idx_scouting_report_embedding_hnsw`; 0.536 ms. |

The first non-null report is the query vector for statements 8–12; it was generated using the configured model and is not a fabricated vector. Query 9 uses the first embedded report whose player has a position. The short sample contains 120 report vectors (plus 60 article vectors), so the normal cost-based choice of a sequential scan is unsurprising. The forced index plan proves the index can serve the ordering; disabling sequential scans does not establish a speed advantage. These are single-run, machine-dependent timings, not benchmarks. The SQL restores planner settings and the transactional drop leaves the index intact.

The view calls for `v_prospect_board` and `fn_match_prospects_for_team` return zero rows by design: Phase 3 does not populate prospects. Their Phase 2 behavior is exercised by the rolled-back fixtures instead. The imported position field is incomplete, so position-based results cover only players with a safely matched position.

## Captured execution plans

The three full `EXPLAIN (ANALYZE, BUFFERS)` outputs from the run above follow. The primary-key index in the InitPlan only chooses the anchor; the scan under the outer `Limit` is the vector retrieval scan.

### Without HNSW

```text
QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=26.30..26.32 rows=5 width=16) (actual time=0.345..0.346 rows=5 loops=1)
   Buffers: shared hit=504
   InitPlan 1 (returns $0)
     ->  Limit  (cost=0.14..0.81 rows=1 width=26) (actual time=0.003..0.003 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Index Scan using scouting_report_pkey on scouting_report anchor  (cost=0.14..80.20 rows=120 width=26) (actual time=0.003..0.003 rows=1 loops=1)
                 Filter: (embedding IS NOT NULL)
                 Buffers: shared hit=2
   ->  Sort  (cost=25.49..25.79 rows=120 width=16) (actual time=0.345..0.345 rows=5 loops=1)
         Sort Key: ((sr.embedding <=> $0))
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=504
         ->  Seq Scan on scouting_report sr  (cost=0.00..23.50 rows=120 width=16) (actual time=0.011..0.335 rows=120 loops=1)
               Filter: (embedding IS NOT NULL)
               Buffers: shared hit=504
 Planning:
   Buffers: shared hit=5
 Planning Time: 0.044 ms
 Execution Time: 0.353 ms
```

### HNSW available, default planner

```text
QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=26.30..26.32 rows=5 width=16) (actual time=0.324..0.324 rows=5 loops=1)
   Buffers: shared hit=504
   InitPlan 1 (returns $0)
     ->  Limit  (cost=0.14..0.81 rows=1 width=26) (actual time=0.002..0.002 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Index Scan using scouting_report_pkey on scouting_report anchor  (cost=0.14..80.20 rows=120 width=26) (actual time=0.002..0.002 rows=1 loops=1)
                 Filter: (embedding IS NOT NULL)
                 Buffers: shared hit=2
   ->  Sort  (cost=25.49..25.79 rows=120 width=16) (actual time=0.323..0.324 rows=5 loops=1)
         Sort Key: ((sr.embedding <=> $0))
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=504
         ->  Seq Scan on scouting_report sr  (cost=0.00..23.50 rows=120 width=16) (actual time=0.008..0.314 rows=120 loops=1)
               Filter: (embedding IS NOT NULL)
               Buffers: shared hit=504
 Planning:
   Buffers: shared hit=18
 Planning Time: 0.062 ms
 Execution Time: 0.330 ms
```

### HNSW available, sequential scans discouraged

```text
QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=125.71..129.44 rows=5 width=16) (actual time=0.517..0.530 rows=5 loops=1)
   Buffers: shared hit=192
   InitPlan 1 (returns $0)
     ->  Limit  (cost=0.14..0.81 rows=1 width=26) (actual time=0.003..0.004 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Index Scan using scouting_report_pkey on scouting_report anchor  (cost=0.14..80.20 rows=120 width=26) (actual time=0.003..0.003 rows=1 loops=1)
                 Filter: (embedding IS NOT NULL)
                 Buffers: shared hit=2
   ->  Index Scan using idx_scouting_report_embedding_hnsw on scouting_report sr  (cost=124.90..214.40 rows=120 width=16) (actual time=0.517..0.529 rows=5 loops=1)
         Order By: (embedding <=> $0)
         Buffers: shared hit=192
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.032 ms
 Execution Time: 0.536 ms
```
