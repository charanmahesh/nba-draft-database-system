-- Run from the repository root with psql. \copy reads the local, gitignored
-- CSV files rather than requiring the database container to mount dataset/.

TRUNCATE stg_nba_team, stg_nba_player, stg_nba_game, stg_nba_game_detail, stg_draft_combine;

\copy stg_nba_team FROM 'dataset/teams.csv' WITH (FORMAT csv, HEADER true)
\copy stg_nba_player FROM 'dataset/players.csv' WITH (FORMAT csv, HEADER true)
\copy stg_nba_game FROM 'dataset/games.csv' WITH (FORMAT csv, HEADER true)
\copy stg_nba_game_detail FROM 'dataset/games_details.csv' WITH (FORMAT csv, HEADER true)
\copy stg_draft_combine FROM 'dataset/Draft Combine - Kaggle.csv' WITH (FORMAT csv, HEADER true)
