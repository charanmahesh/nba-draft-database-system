# Phase 6 handoff

Status: work in progress. Chunks 2 and 3 are not accepted as complete. The API implementation was committed with partial verification at the user's request; no Phase 7 work has started.

## Routes currently present

- Phase 5: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; public `GET /api/health`; authenticated embedding spike `GET /api/embedding`.
- Chunk 1: `GET /api/team-match?teamId=...` calls `fn_match_players_for_team`, guarded for admins and the owning manager. The earlier `GET /api/teams/:teamId/matches` remains an authorized **501 stub**; it is not connected to the match function.
- Chunk 2 WIP: `GET /api/players`, `GET /api/players/:id`, `GET /api/teams`, `GET /api/games`, and `GET`/`POST` for `/api/performances`, `/api/measurements`, and `/api/injuries`. The player list supports page, limit, position, team, season, minGames, name and sort; detail includes the profile, season averages, measurements, injuries, reports and mentioned news. Writes are limited to admin/analyst.
- Chunk 3 WIP: `GET`/`POST /api/teams/:teamId/needs`, `GET`/`POST /api/teams/:teamId/roster`, and `DELETE /api/teams/:teamId/roster/:playerId?rosterId=...`. These use admin/owning-manager checks; roster mutations use `withUserTx` and reject historical rosters.
- Reports, news, search, similar-player/report and player-news endpoints are not implemented. Draft stays outside the current scope.

## Checks passed

- `npx tsc --noEmit` passed after the WIP route additions.
- Chunk 1: full `npm run seed` completed and recreated the matching function; manager own team returned 200 with rows, another team 403, scout 403 and bad team ID 400.
- A demo scout received 200 on player list/detail, teams, games, performances, measurements and injuries reads.
- Empty POST bodies to performance, measurement and injury routes returned 400; a valid-shaped performance request by a scout returned 403.
- On a managed roster, the manager added 15 players and the sixteenth returned 422; audit rows for the inserts included the manager's person ID as `changed_by`. The 15 memberships were subsequently removed via the API. The resulting insert/delete audit rows remain in the local database as evidence of the test.

## Checks remaining

- Run comprehensive chunk 2 acceptance checks per role: successful admin/analyst writes for performances, measurements and injuries, denial for unauthorized roles, validation and database constraint errors for each group; verify player pagination/filter/sort combinations, empty results and 404 handling. Clean up any test fixtures safely.
- Verify team-needs reads/writes, own-team and cross-team authorization, invalid inputs and absent teams. Verify roster list/detail and add/remove success, absent records, duplicate membership, historical roster rejection, concurrent cap behavior, rollback and audit attribution for deletion. Re-run TypeScript and production build after fixes.
- Review and consistently map PostgreSQL errors for every route, without exposing internal messages. Run the full Phase 6 API tests and document them in `docs/test-results.md`.
- Complete team-match documentation in `docs/data-dictionary.md` and `docs/queries.md`; finish report/news embedding failure and backfill flows, semantic and keyword search endpoints, and `docs/api.md` before Phase 6 is complete.

## Known gaps and bugs

- `GET /api/players` gets its total from a window count on returned rows: a valid page beyond the last page incorrectly reports total `0` instead of the total matching rows. It also returns the window `total` on each item.
- `GET /api/teams` validates page/limit but ignores them, returning all teams. Team, game, performance, measurement and injury detail/update/delete operations required by the intended core API have not been implemented; roster detail has no distinct endpoint.
- Needs can be listed and created but cannot yet be edited or removed. Roster collection reads are currently restricted to admin/owning manager; review against the intended read permissions. Absent team IDs can return empty lists rather than 404.
- The old `/api/teams/:teamId/matches` 501 stub remains. The Phase 6 real match endpoint is `/api/team-match`.
- Query parameters are converted with `Object.fromEntries`, so duplicate keys silently take the last value. Review input and edge-case validation, error responses, and paging consistency before treating these endpoints as production ready.
- The core error handler maps trigger/check errors to a generic 422 except the roster-cap message; verify all required readable error mappings. The handoff does not claim successful write tests for the three analyst/admin resource groups.
