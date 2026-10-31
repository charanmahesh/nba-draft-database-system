# Phase 3A import mapping

## Selected source subset

The import uses the Nathan Lauga NBA dataset's `teams.csv`, `games.csv`, and
`games_details.csv` rows for seasons **2017, 2018, and 2019**. A player is
imported after at least **25 game-detail appearances** in that subset, or when
the player has a safely matched Draft Combine row. This keeps the demo volume
useful while retaining players whose verified physical measurements matter.

`players.csv` is loaded as a raw provenance file but is not the player-identity
authority: `games_details.csv` provides the actual player/game/team relationship
needed for the selected seasons.

## NBA mappings

| CSV column(s) | Target | Rule |
| --- | --- | --- |
| `teams.TEAM_ID` | `team.external_id` | Prefixed `nba:`; idempotent source key. |
| `teams.CITY`, `NICKNAME` | `team.city`, `team_name` | Name is `CITY NICKNAME`; game-only teams receive `NBA Team <id>` fallback. |
| `games.GAME_ID` | `game.external_id` | Prefixed `nba:` and unique. |
| `GAME_DATE_EST`, `SEASON`, `HOME_TEAM_ID`, `VISITOR_TEAM_ID` | `game` | ISO date, integer season, resolved by team external ID. Only selected seasons; same-team games rejected. |
| `games_details.PLAYER_ID`, `PLAYER_NAME` | `player` | One project-owned identity per prefixed NBA player ID. First/last names split at final whitespace. |
| `games_details.MIN` | `game_performance.minutes` | `MM:SS` becomes decimal minutes; numeric forms supported; blank/DNP rows skipped. |
| `PTS`, `REB`, `AST`, `BLK`, `STL` | `game_performance` | Decimal source values, defaulting valid blanks to 0. Game/team must match a selected `game`. |
| player/team/season performance counts | `roster`, `roster_player` | Most games per player-season selects one historical team; per-game team is retained in `game_performance`. Historical rosters bypass the app roster cap. |

## Draft Combine mappings and identity safety

The Draft Combine file is loaded but **never creates a player or
`draft_prospect` row**. Its `Last, First` player string is reordered before
matching. Normalization lowercases and removes punctuation/whitespace only;
suffix tokens such as `Jr`, `II`, and `III` remain part of the key.

A combine row is accepted only when its normalized name occurs once in the
combine data, once among selected NBA candidates, and the candidate's earliest
observed NBA season is from the combine year through eight years later. Every
other combine row is written to `import_unmatched` with a reason; no fuzzy or
best-effort match is used.

| Combine columns | Target | Conversion |
| --- | --- | --- |
| `POS` | `player.position`, `secondary_position` | `/` becomes `-`; first allowed label is primary and second is secondary. |
| `HGT`, `WGT` | `player.height_cm`, `weight_kg`; measurements | Inches × 2.54; pounds × 0.45359237. |
| `WNGSPN`, `STNDRCH`, `LPVERT` | `combined_measurement` | Inches × 2.54, stored in cm. `LPVERT` is the vertical-leap measure. |
| `BENCH` | `combined_measurement` | Repetitions. |
| `LANE`, `SPRINT`, `SHUTTLE` | `combined_measurement` | Seconds. |
| `STNDVERT`, `BMI`, `BF`, `HANDL`, `HANDW`, `BAR`, `PAN`, `PBHGT`, `PDHGT` | Not imported | Standing vertical duplicates the selected vertical convention or is derived/sparse; remaining fields are derived, non-required, or sparse. |

`NA`, blank, and non-numeric values become NULL: no measurement row is created.
`measured_on` is NULL because the source gives only a year.

## Run order

From the repository root, after applying the Phase 1 and Phase 2 SQL files:

```powershell
.\scripts\import-phase3a.ps1
```

The final queries in `02_transform.sql` are the required import report,
including unmatched/ambiguous combine records. `injury_history` is untouched;
no injuries are fabricated.
