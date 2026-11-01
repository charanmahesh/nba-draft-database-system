# API reference

All paths are relative to the application origin. Except login and health, routes require the JWT session cookie from login. **All roles** means admin, scout, analyst and team_manager. **Own manager** means a team manager assigned to the team in the path or query. IDs in JSON bodies are decimal strings; dates use `YYYY-MM-DD`. Examples omit fields for readability where `…` appears. Actual IDs, content and result counts depend on the seed.

Successful responses use `{ "ok": true, "data": ... }`; errors use `{ "ok": false, "error": "..." }`. Typical statuses: 200 for reads/updates/deletes, 201 for creates, 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 uniqueness or foreign-key conflict, 422 database rule violation, and 500/503 on service failure. Validation can happen before authorization. List `page` defaults to 1 (maximum 100000) and `limit` to 20 (maximum 100). Search `k` defaults to 5 (maximum 100).

## Authentication and diagnostics

| Method and path | Roles | Parameters | Example response |
| --- | --- | --- | --- |
| POST `/api/auth/login` | Public | JSON `email`, `password` | `{"ok":true,"data":{"person_id":"1","role":"admin","team_id":null,…}}` (sets httpOnly cookie) |
| POST `/api/auth/logout` | All roles | None | `{"ok":true,"data":null}` (clears cookie) |
| GET `/api/auth/me` | All roles | None | `{"ok":true,"data":{"person_id":"1","role":"admin","team_id":null,…}}` |
| GET `/api/health` | Public | None | `{"ok":true,"data":{"database":"draftboard","vectorEnabled":true}}` |
| GET `/api/embedding` | All roles | None | `{"ok":true,"data":{"model":"Xenova/all-MiniLM-L6-v2","dimensions":384,"expectedDimensions":384}}` |

## Dashboard

`GET /api/dashboard` requires any authenticated role and accepts no parameters. It returns role-specific data derived from the authenticated session: `{"ok":true,"data":{"role":"scout","report_count":1,"pending_count":0,"reports":[]}}` is an example. Admin receives counts, recent reports and open needs; analyst receives points-per-game and per-minute efficiency leaders (minimum ten games); manager receives their own team needs, latest app-managed roster and top five matches. Counts cover the database rather than a paginated sample.

## Players, teams and games

| Method and path | Roles | Parameters | Example response |
| --- | --- | --- | --- |
| GET `/api/players` | All roles | Query `page`, `limit`, `position` (PG/SG/SF/PF/C), `team`, `season`, `minGames`, `name`, `sort` (name/points/games) | `{"ok":true,"data":{"items":[],"total":0,"page":1,"limit":20}}` |
| GET `/api/players/:id` | All roles | Player ID | `{"ok":true,"data":{"player_id":"1",…, "season_averages":[],"measurements":[],"injuries":[],"reports":[],"news":[]}}` |
| GET `/api/teams` | All roles | Query `page`, `limit` | `{"ok":true,"data":[{"team_id":"1","team_name":"Example","city":"Example"}]}` |
| POST `/api/teams` | Admin | JSON `team_name`, `city` | `{"ok":true,"data":{"team_id":"31","team_name":"Example","city":"Example"}}` |
| PATCH `/api/teams/:teamId` | Admin | JSON at least one of `team_name`, `city` | `{"ok":true,"data":{"team_id":"31","team_name":"Example","city":"New City"}}` |
| GET `/api/games` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| GET `/api/performances` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| POST `/api/performances` | Admin, analyst | JSON `game_id`, `player_id`, `team_id`, `minutes` (0–70); optional nonnegative `points`, `rebounds`, `assists`, `blocks`, `steals` default to 0 | `{"ok":true,"data":{"performance_id":"1",…}}` |
| GET `/api/measurements` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| POST `/api/measurements` | Admin, analyst | JSON `player_id`, `measurement_type`, `combine_year`, `value`, `unit`; optional `measured_on` date or null | `{"ok":true,"data":{"measurement_id":"1",…}}` |
| GET `/api/injuries` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| POST `/api/injuries` | Admin, analyst | JSON `player_id`, `injury_date`, `description`, `severity` (minor/moderate/severe) | `{"ok":true,"data":{"injury_id":"1",…}}` |

Measurement types: `height_cm`, `weight_kg`, `wingspan_cm`, `standing_reach_cm`, `vertical_leap_cm`, `bench_press_reps`, `lane_agility_seconds`, `three_quarter_sprint_seconds`, `shuttle_run_seconds`.

## Team management and people

| Method and path | Roles | Parameters | Example response |
| --- | --- | --- | --- |
| POST `/api/persons` | Admin | JSON `f_name`, `l_name`, `email`, `password`, `role`, `subtype` | `{"ok":true,"data":{"person_id":"5","f_name":"Example","l_name":"Scout","email":"scout@example.test","role":"scout"}}` |
| GET `/api/teams/:teamId/needs` | Admin, own manager | Team ID | `{"ok":true,"data":[]}` |
| POST `/api/teams/:teamId/needs` | Admin, own manager | JSON `position`, `priority` (1–5), optional `description` | `{"ok":true,"data":{"need_id":"1","team_id":"1","position":"PG",…}}` |
| GET `/api/teams/:teamId/roster` | Admin, own manager | Team ID | `{"ok":true,"data":[{"roster_id":"1","team_id":"1",…, "players":[]}]}` |
| POST `/api/teams/:teamId/roster` | Admin, own manager | JSON `roster_id`, `player_id` | `{"ok":true,"data":{"roster_id":"1","player_id":"1",…}}` |
| DELETE `/api/teams/:teamId/roster/:playerId` | Admin, own manager | Query `rosterId` required | `{"ok":true,"data":{"roster_id":"1","player_id":"1",…}}` |
| GET `/api/team-match` | Admin, own manager | Query `teamId` required | `{"ok":true,"data":[]}` |
| GET `/api/teams/:teamId/matches` | Admin, own manager | Team ID; alias of `/api/team-match` | `{"ok":true,"data":[]}` |

Person `subtype` must match `role`: `{"role":"admin"}`, `{"role":"scout","experience":2}`, `{"role":"analyst","specialization":"analytics"}`, or `{"role":"team_manager","team_id":"1"}`. Experience and specialization are optional; manager team ID is required. The person and subtype are inserted in one transaction. Historical rosters cannot be modified; managed rosters have a 15-player cap. Roster writes are audited with the session actor.

## Reports and news

| Method and path | Roles | Parameters | Example response |
| --- | --- | --- | --- |
| GET `/api/reports` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| POST `/api/reports` | Admin, scout | JSON `player_id`, `summary`; optional `report_date`, `scout_id` (required for admin, must be self for scout) | `{"ok":true,"data":{"report_id":"1","summary":"Example","embedding_status":"indexed",…}}` |
| GET `/api/reports/:id` | All roles | Report ID | `{"ok":true,"data":{"report_id":"1","summary":"Example","embedding_status":"pending",…}}` |
| PATCH `/api/reports/:id` | Admin, owning scout | JSON `summary` | `{"ok":true,"data":{"report_id":"1","summary":"Revised","embedding_status":"indexed",…}}` |
| DELETE `/api/reports/:id` | Admin, owning scout | Report ID | `{"ok":true,"data":{"report_id":"1",…}}` |
| GET `/api/news` | All roles | Query `page`, `limit` | `{"ok":true,"data":[]}` |
| POST `/api/news` | Admin | JSON `title`, `publish_date`, `summary`, optional `url` or null | `{"ok":true,"data":{"article_id":"1","title":"Example","embedding_status":"indexed",…}}` |
| GET `/api/news/:id` | All roles | Article ID | `{"ok":true,"data":{"article_id":"1","title":"Example","embedding_status":"pending",…}}` |
| PATCH `/api/news/:id` | Admin | JSON at least one of `title`, `publish_date`, `summary`, `url` | `{"ok":true,"data":{"article_id":"1","title":"Revised","embedding_status":"indexed",…}}` |
| DELETE `/api/news/:id` | Admin | Article ID | `{"ok":true,"data":{"article_id":"1",…}}` |

Text is saved before embedding. On failure, the response reports `embedding_status: "pending"`; `npm run embed -- --missing` backfills pending rows. Editing embedded text clears stale vectors before re-embedding.

## Search

| Method and path | Roles | Parameters | Example response |
| --- | --- | --- | --- |
| GET `/api/search/reports` | All roles | Query `q` required; optional `k`, `position`, `maxInjurySeverity` (minor/moderate/severe) | `{"ok":true,"data":[{"report_id":"1","player_id":"1","similarity":0.8,…}]}` |
| GET `/api/search/keyword` | All roles | Query `q` required, optional `k` | `{"ok":true,"data":[{"report_id":"1","rank":0.1,"headline":"A <mark>guard</mark>…",…}]}` |
| GET `/api/reports/:id/similar` | All roles | Report ID; optional query `k` | `{"ok":true,"data":[{"report_id":"2","similarity":0.8,…}]}` |
| GET `/api/players/:id/similar` | All roles | Player ID; optional query `k` | `{"ok":true,"data":[{"player_id":"2","similarity":0.8,…}]}` |
| GET `/api/players/:id/news` | All roles | Player ID; optional query `k` applies to related articles | `{"ok":true,"data":{"mentions":[],"related":[]}}` |

Semantic search filters position and injury severity in the vector query. Similar reports and players exclude the source; player similarity is the best report-pair similarity. Player news returns all exact mentions newest first and up to `k` related articles ordered by similarity, excluding mentions. Headlines contain markup around matched terms; treat source text as untrusted when rendering.
