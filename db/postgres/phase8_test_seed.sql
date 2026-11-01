-- Deterministic synthetic fixtures for the isolated Phase 8 SQL test database.
BEGIN;
INSERT INTO team(external_id,team_name,city) VALUES ('test:team:a','Test Team A','Test'),('test:team:b','Test Team B','Test');
INSERT INTO player(external_id,f_name,l_name,position) VALUES ('test:player:a','Test','Alpha','PG'),('test:player:b','Test','Beta','PG'),('test:player:c','Test','Gamma','SF');
INSERT INTO roster(team_id,season,is_historical) SELECT team_id,2026,false FROM team WHERE external_id IN ('test:team:a','test:team:b');
INSERT INTO team_need(team_id,position,priority,description) SELECT team_id,'PG',4,'Synthetic test need' FROM team WHERE external_id='test:team:a';
WITH actor AS (INSERT INTO person(f_name,l_name,email,password_hash,role) VALUES ('Test','Admin','admin@phase8.invalid','not-a-login-hash','admin') RETURNING person_id) INSERT INTO admin(person_id) SELECT person_id FROM actor;
INSERT INTO game(external_id,game_date,season,home_team_id,away_team_id)
SELECT 'test:game:'||n,DATE '2020-01-01'+n,2020,(SELECT team_id FROM team WHERE external_id='test:team:a'),(SELECT team_id FROM team WHERE external_id='test:team:b') FROM generate_series(1,10) n;
INSERT INTO game_performance(game_id,player_id,team_id,minutes,points,rebounds,assists,steals,blocks)
SELECT g.game_id,p.player_id,g.home_team_id,20,CASE p.external_id WHEN 'test:player:a' THEN 20 ELSE 10 END,4,3,2,1
FROM game g CROSS JOIN player p WHERE g.external_id LIKE 'test:game:%' AND p.external_id IN ('test:player:a','test:player:b');
COMMIT;
