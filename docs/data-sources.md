# Data sources

## Phase 3A real data

| Dataset | Provider and URL | Files used | Licence/status | Project use |
| --- | --- | --- | --- | --- |
| NBA Games | Nathan Lauga, Kaggle: [NBA Games](https://www.kaggle.com/datasets/nathanlauga/nba-games) | `teams.csv`, `players.csv`, `games.csv`, `games_details.csv` | Kaggle dataset; follow Kaggle's dataset terms | Real teams, selected games, performances, and historical rosters. |
| NBA Draft Combine Measurements | Kaggle: [NBA Draft Combine Measurements](https://www.kaggle.com/datasets/marcusfern/nba-draft-combine) | `Draft Combine - Kaggle.csv` | Kaggle dataset; follow Kaggle's dataset terms | Safely matched physical attributes and measurements only. |

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

## Phase 3B generated supporting data

`db/postgres/06_seed.sql` creates only application-supporting synthetic data:
four local demo accounts and subtype rows, one manager assigned to the first
imported team, demo team needs, and empty app-managed rosters for the current
calendar year. It does not create player statistics, measurements, injuries,
or draft prospects. The shared demo password is `DraftBoardDemo!2026`; these
accounts are for local demonstration only.

Run `scripts/seed-phase3b.ps1` after the Phase 3A import. It applies the SQL
seed and runs `npm run text:generate`. The generator reads the imported
2017–2019 NBA box-score averages and safely matched combine measurements,
then inserts 120 scouting reports and 60 news-style articles. Each report and
article is explicitly labeled in its text as generated demo material, not a
real scouting report or news item. Articles mention an imported player through
`article_mention`; no real-world event, quote, transaction, or injury is
invented. No injury rows are added.

The generator writes its output to `db/seed/reports.json` and
`db/seed/articles.json`. The report JSON also carries one of eight statistical
profile labels and its evaluation query for the future retrieval evaluator.
Those labels are kept in the JSON output only; they are not added to the
database or embedded in report text. Generated database rows use reserved
prefixes so rerunning the generator replaces only its own records. The
generator prints the first 20 report summaries for a spot-check.

These are synthetic demo texts based on real imported values, not authored
scouting analysis or published reporting. Do not present them as genuine
scouting reports or news in the demo.
