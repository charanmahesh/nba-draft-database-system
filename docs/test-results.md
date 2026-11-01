# Local verification — 2026-11-01

On macOS with PostgreSQL 16 in pgvector Docker, Node 22 and Homebrew psql 18:

- Health endpoint returned `ok: true` with the vector extension enabled; embedding spike returned 384 dimensions and cosine similarity 0.547003.
- Phase 1 scripts applied twice and `phase1_acceptance.sql` passed, including the duplicate player-season roster rejection.
- Phase 2 scripts applied twice and `07_queries.sql` reported its views, functions, procedure, trigger, audit, rollback and failing-case fixtures passed. This is the Phase 2 acceptance run; Phase 4 showcase work remains planned.
- Full `npm run seed` completed after fixing import and SQL defects. Initial retrieval failed; text was revised and the final run passed every 60% threshold.
- Precision@5: rim protector 5/5, high-volume scorer 4/5, playmaking guard 5/5, two-way wing 5/5, rebounding big 4/5, defensive disruptor 4/5, per-minute contributor 3/5, measured profile 5/5; macro 87.5%.
- Import: 30 teams, 739 players, 4,001 games, 85,287 performances, 90 historical rosters, 1,597 roster memberships, 3,202 measurements. Unmatched combine rows: 1,258 no name match, 74 implausible debut, 2 ambiguous combine names, 1 ambiguous NBA name.
- Supporting rows: 4 persons, 1 each subtype, 150 needs, 30 app-managed rosters, 120 reports, 60 articles and 60 mentions. `draft_prospect` and `injury_history` both contain zero rows.

The retrieval queries share vocabulary with generated text; this synthetic evaluation is a demo check, not evidence of general retrieval quality. npm reported seven dependency audit findings.
