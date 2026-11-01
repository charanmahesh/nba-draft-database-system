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

## Retrieval hardening — 2026-11-01

Re-ran `npm run seed` after replacing the eight archetypes and adding a second paraphrased query set; the full command passed. `npx tsc --noEmit` passed. Precision@5 by role (standard / paraphrased): rim protector 5/5 / 5/5; sharpshooter 5/5 / 5/5; playmaking guard 5/5 / 5/5; two-way wing 5/5 / 5/5; slasher 5/5 / 5/5; stretch big 5/5 / 5/5; defensive stopper 5/5 / 3/5; raw athlete 5/5 / 5/5. Macro precision: 100% / 95%; every query meets the 60% threshold.

Descriptions were iteratively revised using both query sets, so these figures are in-sample development results, not an independent estimate. Shooting counts in the source use decimal formatting and are parsed accordingly. A prior test incorrectly excluded those values and its results were discarded. See the selected, rechecked result lists and proxy limitations in [vector-search.md](vector-search.md).

## Phase 5 authentication and authorization — 2026-11-01

`npm run build` passed and the production server was checked with `scripts/phase5-check.ts` against the seeded PostgreSQL database. Admin, scout, analyst and team manager login and `/api/auth/me` passed. Invalid input returned 400; incorrect password, invalid JWT and anonymous `/me` returned 401. Anonymous `/dashboard` redirected to login, while health remained public. Production cookies had HttpOnly, Secure, SameSite=Lax and a one-hour maximum age; logout sent a zero-age cookie.

Scout and analyst received 403 for needs and roster writes and match board; a manager received 403 for the same endpoints on another team. Admin on another team and manager on their own team reached the authorized 501 placeholders. `withUserTx` set the transaction-local actor and rolled back a deliberately failed insert. These endpoints are authorization stubs, not Phase 6 functionality. Logout clears the browser cookie; JWTs are stateless and a copied token remains valid until its one-hour expiry.

Reproduce with a running server and `DEMO_PASSWORD` set to the README's local demo password: `npx tsx scripts/phase5-check.ts`. For a production server, set `TEST_BASE_URL` and `TEST_EXPECT_SECURE=1` as well. The login UI is planned for Phase 7.

## Phase 6 chunk 4 — 2026-11-01

`npm run check:api` passed 154 checks against the seeded local database, using normal and forced-failure development servers. Report and news creation, failed embedding, backfill, edited text invalidation and re-embedding, report ownership, and the team matches alias were exercised; fixtures were removed. `npx tsc --noEmit` and `npm run build` passed. The backfill command processes all pending documents in the configured database.

## Phase 6 chunk 5 — 2026-11-01

The expanded API matrix passed 176 checks against seeded data. It checked the three selected keyword-miss/semantic-hit examples against their generated archetype labels, similarity ordering and limits, position and injury filters, self-exclusion, exact news mentions, keyword rank and headlines, and invalid or anonymous requests. These examples remain in-sample demonstrations as described in `vector-search.md`.

## Phase 6 final API matrix — 2026-11-01

The final local run against the seeded PostgreSQL database and two development servers produced:

```text
Results: 200 passed, 0 failed
```

`npx tsc --noEmit` and `npm run build` also passed. The matrix covers role and team restrictions, writes and cleanup, 404/409/422 responses, roster cap and audit actor, report/news embedding failure and backfill, production-mode failure-flag behavior, and search filters and retrieval examples. It exercises representative errors; it is not an exhaustive fault-injection test for every database failure. Follow the two-server instructions in the README to reproduce; backfill processes all pending documents in the configured database.

## Phase 7 workspace routes — 2026-11-01

After adding report ownership filtering, game box scores, person listing and team-need updates/deletes, `npm run check:api` passed **216 checks, 0 failed** against the seeded database. The added checks cover box-score completeness, scout report filtering, admin-only person listing, manager need updates/deletes and cross-team denials. `npx tsc --noEmit` and `npm run build` passed. Existing databases need the updated `db/postgres/04_functions.sql` applied before using these routes.

## Playwright dependency — 2026-11-01

`@playwright/test` is a development dependency for browser acceptance checks, including the planned Phase 8 UI tests. Chromium was installed locally for those checks. The scout-only browser acceptance suite is implemented; the other role checks remain to be added.

## Phase 7 scout browser check — 2026-11-01

`npm run check:ui` passed **9 checks, 0 failed** against the seeded local database and development server. It verifies real login, own reports, indexing and re-indexing, similar reports, access-denied screens for games and teams, sidebar navigation and browser console errors. Test reports and the other-scout fixture are removed after the run. Set `DEMO_PASSWORD` as in the README; failure screenshots are written to `tests/ui-failures/`.
