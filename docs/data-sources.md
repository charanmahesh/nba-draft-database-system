# Data sources

## Phase 3A real data

| Dataset | Provider and URL | Files used | Licence/status | Project use |
| --- | --- | --- | --- | --- |
| NBA Games | Nathan Lauga, Kaggle: [NBA Games](https://www.kaggle.com/datasets/nathanlauga/nba-games) | `teams.csv`, `players.csv`, `games.csv`, `games_details.csv` | Kaggle dataset; follow Kaggle's dataset terms | Real teams, selected games, performances, and historical rosters. |
| NBA Draft Combine Measurements | Kaggle: [NBA Draft Combine Measurements](https://www.kaggle.com/datasets/mattop/nba-draft-combine-measurements) | `Draft Combine - Kaggle.csv` | Kaggle dataset; follow Kaggle's dataset terms | Safely matched physical attributes and measurements only. |

The documented NBA subset is 2017–2019. The importer retains players with at
least 25 selected-subset appearances and any safely matched combine player.
All real source CSVs live locally in the gitignored [dataset/](../dataset)
folder and are loaded using `psql \copy`.

The source column `SEASON` is treated as the source season label (for example,
`2019`), rather than inventing a calendar range. Player IDs, team IDs, and game
IDs are retained as prefixed `external_id` values to make reruns traceable.

## Identity and scope safeguards

Draft Combine matches require unique normalized names on both sides and a
plausible observed NBA debut window; unmatched or ambiguous rows are stored in
`import_unmatched`. The importer never creates combine-only players and never
inserts `draft_prospect` rows. It does not import the Draft Like a Pro dataset.

`injury_history` is deliberately empty in Phase 3A: no real injury source has
been introduced, so no injuries are fabricated.

## Generated data

No generated data is created by Phase 3A. Scouting reports, news articles, and
their embeddings belong to Phase 3B/3C and are intentionally not part of this
implementation.
