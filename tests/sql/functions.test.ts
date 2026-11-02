import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { connect } from "../support/db";
let db:Client;
beforeAll(async()=>{db=await connect()});
afterAll(async()=>{await db.end()});
describe("scouting functions",()=>{
 it("computes efficiency from all recorded counting stats and minutes",async()=>{const result=await db.query("SELECT fn_player_efficiency(player_id) AS efficiency FROM player WHERE external_id=$1",["test:player:a"]);expect(Number(result.rows[0].efficiency)).toBeCloseTo(1.5,6);});
 it("returns zero efficiency for a player without performances",async()=>{const result=await db.query("SELECT fn_player_efficiency(player_id) AS efficiency FROM player WHERE external_id=$1",["test:player:c"]);expect(Number(result.rows[0].efficiency)).toBe(0);});
 it("returns ranked matching players with expected score components and excludes other positions",async()=>{const result=await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"]);expect(result.rows).toHaveLength(2);expect(result.rows.map(r=>r.l_name)).toEqual(["Alpha","Beta"]);for(const row of result.rows){expect(row).toMatchObject({player_id:expect.any(String),f_name:"Test",position:"PG",match_type:"exact",need_position:"PG",target_season:2026,need_id:expect.any(String),need_priority:4});expect(Number(row.position_score)).toBe(80);expect(Number(row.measurement_bonus)).toBe(0);expect(Number(row.match_score)).toBeCloseTo(Number(row.position_score)+Number(row.stats_score)+Number(row.measurement_bonus),6);}expect(Number(result.rows[0].stats_score)).toBe(30);expect(Number(result.rows[1].stats_score)).toBe(20);expect(Number(result.rows[0].match_score)).toBeGreaterThan(Number(result.rows[1].match_score));});
 it("matches starter groups at half weight only when detailed position is missing",async()=>{
  await db.query("BEGIN");try{
   await db.query("INSERT INTO game_performance(game_id,player_id,team_id,minutes,points,rebounds,assists,blocks,steals) SELECT gp.game_id,c.player_id,gp.team_id,gp.minutes,gp.points,gp.rebounds,gp.assists,gp.blocks,gp.steals FROM game_performance gp JOIN player a ON a.player_id=gp.player_id CROSS JOIN player c WHERE a.external_id=$1 AND c.external_id=$2",["test:player:a","test:player:c"]);
   for(const [need,group] of [["PG","G"],["SG","G"],["SF","F"],["PF","F"],["C","C"]]){
    await db.query("UPDATE team_need SET position=$1 WHERE team_id=(SELECT team_id FROM team WHERE external_id=$2)",[need,"test:team:a"]);
    await db.query("UPDATE player SET position=NULL,position_group=$1 WHERE external_id=$2",[group,"test:player:c"]);
    const rows=(await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"])).rows;
    const row=rows.find(r=>r.l_name==="Gamma");expect(row).toMatchObject({position:null,position_group:group,match_type:"group",need_position:need,need_priority:4});expect(Number(row.position_score)).toBe(40);expect(Number(row.match_score)).toBeCloseTo(Number(row.position_score)+Number(row.stats_score)+Number(row.measurement_bonus),6);
    if(need==="PG"){const exact=rows.find(r=>r.l_name==="Alpha");expect(Number(exact.position_score)).toBe(80);expect(Number(exact.match_score)).toBeGreaterThan(Number(row.match_score));}
    await db.query("UPDATE player SET position_group=$1 WHERE external_id=$2",[group==="G"?"F":"G","test:player:c"]);
    expect((await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"])).rows.some(r=>r.l_name==="Gamma")).toBe(false);
   }
   await db.query("UPDATE team_need SET position='PG' WHERE team_id=(SELECT team_id FROM team WHERE external_id=$1)",["test:team:a"]);
   await db.query("UPDATE player SET position='SG',position_group='G' WHERE external_id=$1",["test:player:c"]);
   expect((await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"])).rows.some(r=>r.l_name==="Gamma")).toBe(false);
   await db.query("UPDATE player SET position=NULL,position_group=NULL WHERE external_id=$1",["test:player:c"]);
   expect((await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"])).rows.some(r=>r.l_name==="Gamma")).toBe(false);
  }finally{await db.query("ROLLBACK");}
 });
 it("excludes players already on any roster in the target season",async()=>{await db.query("BEGIN");try{await db.query("INSERT INTO roster_player(roster_id,player_id,season) SELECT r.roster_id,p.player_id,r.season FROM roster r JOIN team t USING(team_id) CROSS JOIN player p WHERE t.external_id=$1 AND r.season=$2 AND p.external_id=$3",["test:team:b",2026,"test:player:a"]);const result=await db.query("SELECT * FROM fn_match_players_for_team((SELECT team_id FROM team WHERE external_id=$1))",["test:team:a"]);expect(result.rows.map(r=>r.l_name)).toEqual(["Beta"]);}finally{await db.query("ROLLBACK");}});
});
