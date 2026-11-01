import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { escapeIdentifier, type Client } from "pg";
import { connect } from "../support/db";
let db:Client;
beforeAll(async()=>{db=await connect("import")});
afterAll(async()=>{await db.end()});
describe("real-data import into an isolated database",()=>{
 it("matches the documented 2017–2019 subset counts",async()=>{const result=await db.query(`SELECT
 (SELECT count(*)::int FROM team WHERE external_id LIKE 'nba:%') AS teams,
 (SELECT count(*)::int FROM player WHERE external_id LIKE 'nba:%') AS players,
 (SELECT count(*)::int FROM game WHERE external_id LIKE 'nba:%') AS games,
 (SELECT count(*)::int FROM game_performance) AS performances,
 (SELECT count(*)::int FROM roster WHERE is_historical) AS historical_rosters,
 (SELECT count(*)::int FROM roster_player) AS roster_memberships,
 (SELECT count(*)::int FROM combined_measurement) AS measurements`);
 expect(result.rows[0]).toEqual({teams:30,players:739,games:4001,performances:85287,historical_rosters:90,roster_memberships:1597,measurements:3202});
 const raw=await db.query("SELECT count(DISTINCT trim(game_id))::int AS games FROM stg_nba_game WHERE trim(season)=ANY($1::text[]) AND trim(game_date_est) ~ $2 AND trim(home_team_id)<>trim(visitor_team_id)",[["2017","2018","2019"],"^\\d{4}-\\d{2}-\\d{2}$"]);expect(raw.rows[0].games).toBe(result.rows[0].games);
 const range=await db.query("SELECT min(season)::int AS first,max(season)::int AS last,count(*) FILTER(WHERE season NOT BETWEEN 2017 AND 2019)::int AS outside FROM game");expect(range.rows[0]).toEqual({first:2017,last:2019,outside:0});});
 it("has no orphan rows for any public-schema foreign key",async()=>{const constraints=await db.query(`SELECT c.conname,ns.nspname AS child_schema,ch.relname AS child_table,pns.nspname AS parent_schema,pa.relname AS parent_table,
 array_agg(ca.attname::text ORDER BY keys.ordinality) AS child_columns,array_agg(ra.attname::text ORDER BY keys.ordinality) AS parent_columns
 FROM pg_constraint c JOIN pg_class ch ON ch.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=ch.relnamespace
 JOIN pg_class pa ON pa.oid=c.confrelid JOIN pg_namespace pns ON pns.oid=pa.relnamespace
 CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS keys(child_num,parent_num,ordinality)
 JOIN pg_attribute ca ON ca.attrelid=ch.oid AND ca.attnum=keys.child_num JOIN pg_attribute ra ON ra.attrelid=pa.oid AND ra.attnum=keys.parent_num
 WHERE c.contype='f' AND ns.nspname='public' GROUP BY c.oid,ns.nspname,ch.relname,pns.nspname,pa.relname ORDER BY c.conname`);expect(constraints.rows.length).toBeGreaterThan(15);for(const c of constraints.rows){const child=c.child_columns as string[],parent=c.parent_columns as string[];const present=child.map(x=>`child.${escapeIdentifier(x)} IS NOT NULL`).join(" AND ");const join=child.map((x,i)=>`parent.${escapeIdentifier(parent[i])}=child.${escapeIdentifier(x)}`).join(" AND ");const sql=`SELECT count(*)::int AS count FROM ${escapeIdentifier(c.child_schema)}.${escapeIdentifier(c.child_table)} child WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${escapeIdentifier(c.parent_schema)}.${escapeIdentifier(c.parent_table)} parent WHERE ${join})`;const row=await db.query(sql);expect(row.rows[0].count,`${c.child_table}.${c.conname}`).toBe(0);}});
 it("records unmatched combine rows with reasons",async()=>{const result=await db.query("SELECT reason,count(*)::int AS count FROM import_unmatched WHERE source_name=$1 GROUP BY reason ORDER BY reason",["Draft Combine - Kaggle"]);expect(result.rows.length).toBeGreaterThan(0);expect(result.rows.reduce((n,r)=>n+r.count,0)).toBe(1335);expect(result.rows.every(r=>typeof r.reason==="string"&&r.reason.length>0&&r.count>0)).toBe(true);});
 it("does not import prospects or fabricate injuries",async()=>{const result=await db.query("SELECT (SELECT count(*)::int FROM draft_prospect) AS prospects,(SELECT count(*)::int FROM injury_history) AS injuries");expect(result.rows[0]).toEqual({prospects:0,injuries:0});});
 it("assigns historical rosters to the most-played team per player-season",async()=>{const result=await db.query(`WITH ranked AS (SELECT gp.player_id,g.season,gp.team_id,row_number() OVER(PARTITION BY gp.player_id,g.season ORDER BY count(*) DESC,gp.team_id) AS rank FROM game_performance gp JOIN game g USING(game_id) GROUP BY gp.player_id,g.season,gp.team_id) SELECT count(*)::int AS errors FROM ranked x LEFT JOIN roster_player rp ON rp.player_id=x.player_id AND rp.season=x.season LEFT JOIN roster r ON r.roster_id=rp.roster_id WHERE x.rank=1 AND (r.team_id IS DISTINCT FROM x.team_id OR r.is_historical IS DISTINCT FROM true)`);expect(result.rows[0].errors).toBe(0);});
});
