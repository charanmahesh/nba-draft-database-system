# Scout IQ prototype port inventory

`reference/scout-iq` is a design reference, not production code. Rebuild its visuals with Next.js and plain Tailwind components; do not import Base44, the mock data, or its heavy UI kit. Draft is a future extension: the Draft Board becomes a **Team Match Board** for open needs and NBA players, with no draft button.

## Routes and components

| Prototype route | Components used | Port |
| --- | --- | --- |
| `/` | SiteNav, Hero, StatsStrip, ToolkitGrid, SemanticShowcase, RoleCards, ProcessSteps, CtaBand, Footer | Landing page; replace invented counts and claims |
| `/login` | LoginForm, Wordmark | JWT login |
| shared root and `/_app` | DefaultCatchBoundary, NotFound, Toaster, AuthProvider, AppSidebar, Forbidden | Next layout, backend role guards and error handling |
| `/dashboard` | PageHeader, StatTile, SimilarityBar, Pill | Role dashboard |
| `/players` | PageHeader, PlayerFilters, PlayersTable | Paginated NBA players |
| `/players/:playerId` | Pill, MeasurementsTab, PerformanceTab, InjuriesTab, ReportsTab, NewsTab | Player detail |
| `/teams` | PageHeader | Teams and open needs |
| `/games` | PageHeader | Historical games |
| `/reports` | PageHeader | Report list and form |
| `/news` | PageHeader | Generated news feed |
| `/search` | PageHeader, SearchResultCard, Pill | Keyword versus semantic search |
| `/draft-board` | PageHeader, ScoreBreakdown, DraftConfirmDialog | Team Match Board; remove confirmation dialog |
| `/api/time` | server route | Drop; no product requirement |

Other auth components (RegisterPage, LoginPage, ForgotPasswordPage, ResetPasswordPage, ConsentPage, UserNotRegistered, AuthLayout, AuthGate, GoogleIcon, parts) are present but are not routes in this prototype; registration, OAuth and password reset are not in current scope. Generic `components/ui` primitives should be rebuilt only where used.

## Mock functions to replace

This is the original prototype-to-API mapping, retained as design history. The current route contracts are in `api.md`; implementation status is tracked in the reachability audit below. SQL must be parameterized and live in the project SQL files.

| Mock function | API and SQL needed |
| --- | --- |
| `login` | `POST /api/auth/login`: select person by email, verify password; derive role from person, never trust client role. |
| `getPlayers` | `GET /api/players`: player plus aggregate game_performance, latest roster/team and measurements; filters, sort whitelist, pagination in SQL. |
| `getPlayer` | `GET /api/players/:id`: player, v_player_profile, measurements, game_performance JOIN game/team, injury_history, reports, article_mention/news. |
| `getFilterOptions` | `GET /api/players/filters`: fixed positions and supported injury severity; drop class years. |
| `semanticSearch` | `GET /api/search/reports` and `/api/search/keyword`: scouting_report JOIN player; vector `<=>` and FTS `@@` respectively, same relational filters. |
| `findSimilarReports` | Query text: `/api/search/reports`; report ID: `/api/reports/:id/similar`, self-excluding vector nearest neighbours. |
| `getDraftBoard` | `GET /api/teams/:id/matches`: proposed new SQL function `fn_match_players_for_team(team_id)` scores NBA players against open needs by primary position and priority, with transparent measurement and injury components; specify roster eligibility before implementation. |
| `draftProspect` | Drop in current scope; no signing or draft mutation. |
| `getReports` | `GET /api/reports`: scouting_report JOIN player, scout/person; derive indexing status from embedding. |
| `createReport` | `POST /api/reports`: authenticated scout insert in audited transaction where applicable, then embedding update with missing-vector fallback. |
| `getNews` | `GET /api/news`: news_article with article_mention/player joins. |
| `getTeams` | `GET /api/teams`: team, team_need and roster/roster_player aggregates. |
| `getGames` | `GET /api/games`: game JOIN home/away team, paginate. |
| `getDashboard` | `GET /api/dashboard`: role-authorized counts and recent reports, news, games; match function for manager. |

## Mock fields

| Mock fields | Mapping or disposition |
| --- | --- |
| player_id, f_name, l_name, position, height_cm, weight_kg | `player` columns; full_name derived from names |
| wingspan_cm, vertical_cm | latest matching `combined_measurement` value by year; nullable |
| age | derive from `player.dob` if present; otherwise unknown |
| team_name | `roster_player` JOIN `roster` JOIN `team`, clearly label season |
| stats.games_played, minutes, ppg, rpg, apg, bpg, spg | aggregate `game_performance` for selected season or documented sample |
| fg_pct, three_p_pct, ft_pct, ts_pct | drop: not stored in game_performance |
| class_year, is_prospect, draft_rank, draft_stock, scouting_grade, tags, conference | drop from current NBA workflow; no fabricated equivalents |
| injury_severity, injury_label | `injury_history.severity` if documented data exists; absence is unknown, not medical clearance |
| team_id, name, city, needs | `team.team_id`, `team.team_name`, `team.city`, open `team_need.position` |
| roster_count, max_roster | count `roster_player` for selected roster; 15 only for app-managed rosters |
| cap_space_m, record, team conference | drop; no corresponding stored data |
| game_id, game_date, home_team, away_team | `game` and team joins |
| home_score, away_score, game status, venue | drop; not stored |
| game_log opponent, minutes, points, rebounds, assists, blocks, steals | `game_performance` JOIN `game` and opponent team |
| injury_id, injury_type, severity, reported_date | `injury_history.injury_id`, description, severity, injury_date |
| injury status, games_missed | drop; not stored |
| report_id, player_id, summary | `scouting_report` columns |
| report player_name, author, role, created_date | JOIN player, scout/person; `report_date` |
| report status | derive indexed/pending from embedding NULL; tags drop |
| article_id, title, published_date, excerpt | `news_article.article_id`, title, publish_date, summary |
| article player_id | `article_mention` supports multiple players |
| article source, author, category | drop; not stored; label generated content |
| similarity, match_note, counts, pagination, took_ms | derive from query results and request timing; never persist as facts |
| match score, breakdown, board_rank | derive from proposed matching function and ranking; no invented values |
| session email, role, full_name | person email, role, names; JWT stays in httpOnly cookie; drop mock token and client-selected role |

## Phase 7 feature reachability audit

This checklist maps the current implementation, rather than implying that a database demonstration is exposed merely because it exists in SQL. Draft and prospect workflows remain future extensions under the active scouting scope.

| Phase | Feature | UI reachability | Status |
| --- | --- | --- | --- |
| 2 | `v_player_profile`: player and measurements/injury count | `/players/:id` | Available (profile and detail sections) |
| 2 | `v_team_open_needs` | `/teams`, `/team-match` | Available through `/showcase`; team-specific needs also appear on `/teams` and `/team-match` |
| 2 | `v_prospect_board`, prospect matcher and draft procedure | None | Future draft extension, outside active scope |
| 2 | Player efficiency | `/dashboard` analyst | Available on the analyst dashboard; ranking calls `fn_player_efficiency` |
| 2 | Roster cap, unique membership, transaction and audit attribution | `/teams` roster add/remove | Available through writes; `/showcase` exposes audit attribution and a fixed rollback demonstration to admin |
| 2 | Game team and minutes validation | `/games` performance form | Available through validation and database constraints |
| 2 | Person/subtype consistency | `/teams` admin person form | Available through transactional creation |
| 2 | Stale embedding trigger and backfill | `/reports`, `/news/:id` | Status visible after edits; manual backfill remains the Phase 3 script |
| 4 | Multi-table JOIN, grouped averages, ordering/limit | `/games`, `/players`, analyst `/dashboard` | Available on `/showcase`, alongside `/games`, `/players` and analyst `/dashboard` |
| 4 | Correlated subquery, EXISTS, position window ranking | None | Available as fixed read-only examples on `/showcase` |
| 4 | Keyword, pure vector and hybrid search | `/search`, `/reports` similar panel | Available |
| 4 | HNSW EXPLAIN with/without index | None | Available on `/showcase` using disabled index scans, default planning, and discouraged sequential scans; the index is never dropped |
| 6 | Auth and role-aware dashboard | `/login`, `/dashboard` | Available |
| 6 | Players, teams, needs, rosters, games and box scores | `/players`, `/players/:id`, `/teams`, `/games` | Available collection/detail operations as implemented; API has no general game or player write routes |
| 6 | Measurements and performances | `/games` | Create and read available |
| 6 | Injuries | `/players/:id` | Available to read and to create for admin/analyst |
| 6 | Reports and similar reports | `/reports`, `/players/:id` | Available to read, create, edit, delete and find similar reports |
| 6 | News and related news | `/news`, `/news/:id`, `/players/:id` | Available to read, create, edit, delete and find related articles |
| 6 | Team matching | `/team-match` | Available to admin and owning manager |
| 6 | Keyword and semantic search, similar players | `/search`, `/players/:id` | Available |
| 6 | Health and embedding diagnostic endpoints | None | Available under `/showcase` service diagnostics |

The draft procedure and prospect objects remain documented future extensions. `/showcase` provides a fixed, admin-only rollback demonstration; its temporary player, roster and audit fixtures are rolled back. Embedding backfill remains the documented Phase 3 script rather than a UI action.
