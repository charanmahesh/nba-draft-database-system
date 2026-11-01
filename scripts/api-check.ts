import "dotenv/config";
import { pool } from "../lib/db/pg";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD;
const results: { check: string; result: string }[] = [];
const cookies: Record<string, string> = {};
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({check:name, result:"PASS"}); }
  catch (error) { results.push({check:name, result:`FAIL: ${error instanceof Error ? error.message : error}`}); }
}
async function request(role: string, path: string, status: number, method = "GET", body?: unknown) {
  const response = await fetch(`${base}${path}`, {method, headers: {cookie:cookies[role] ?? "", "content-type":"application/json"}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const data = await response.json().catch(() => null);
  if (response.status !== status || (status < 400 && !data?.ok)) throw new Error(`expected ${status}, got ${response.status}: ${JSON.stringify(data)}`);
  return data?.data;
}
async function main() {
  if (!password) throw new Error("Set DEMO_PASSWORD to the documented local demo password");
  for (const role of ["admin", "scout", "analyst", "manager"]) {
    await check(`${role} login`, async () => {
      const response = await fetch(`${base}/api/auth/login`, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({email:`${role}@draftboard.local`,password})});
      if (response.status !== 200) throw new Error(`login returned ${response.status}`);
      cookies[role] = (response.headers.get("set-cookie") ?? "").split(";")[0];
      if (!cookies[role]) throw new Error("missing session cookie");
    });
  }
  const me = await request("manager", "/api/auth/me", 200);
  const team = String(me.team_id), actor = String(me.person_id);
  const other = (await pool.query("SELECT team_id FROM team WHERE team_id <> $1 ORDER BY team_id LIMIT 1",[team])).rows[0].team_id;
  const player = String((await pool.query("SELECT player_id FROM player ORDER BY player_id LIMIT 1")).rows[0].player_id);
  const game = (await pool.query("SELECT game_id, home_team_id FROM game ORDER BY game_id LIMIT 1")).rows[0];
  const freePlayer = (await pool.query("SELECT player_id FROM player WHERE NOT EXISTS (SELECT 1 FROM game_performance WHERE game_id=$1 AND game_performance.player_id=player.player_id) LIMIT 1",[game.game_id])).rows[0].player_id;
  for (const path of ["players", `players/${player}`, "teams", "games", "performances", "measurements", "injuries"]) {
    for (const role of ["admin","scout","analyst","manager"]) await check(`${path}: ${role} read`, async () => { await request(role,`/api/${path}`,200); });
    await check(`${path}: invalid`, async () => { await request("admin",path.startsWith("players/") ? "/api/players/invalid" : `/api/${path}?page=0`,400); });
  }
  await check("players: empty page retains total", async () => { const first = await request("admin", "/api/players?limit=1", 200); const last = await request("admin", "/api/players?limit=1&page=100000", 200); if (!first.total || last.total !== first.total || last.items.length || "total" in first.items[0]) throw new Error("incorrect total or page items"); });
  await check("teams: pagination", async () => { const rows = await request("admin", "/api/teams?limit=1", 200); if (rows.length !== 1) throw new Error("limit ignored"); });
  const writes = [
    {path:"performances", body:{game_id:String(game.game_id),player_id:String(freePlayer),team_id:String(game.home_team_id),minutes:1}, table:"game_performance", key:"performance_id"},
    {path:"measurements", body:{player_id:player,measurement_type:"height_cm",combine_year:2199,value:180,unit:"cm"}, table:"combined_measurement", key:"measurement_id"},
    {path:"injuries", body:{player_id:player,injury_date:"2026-01-01",description:"API acceptance fixture",severity:"minor"}, table:"injury_history", key:"injury_id"},
  ];
  for (const w of writes) {
    for (const role of ["admin","analyst"]) await check(`${w.path}: ${role} write`, async () => { const row = await request(role,`/api/${w.path}`,201,"POST",w.body); await pool.query(`DELETE FROM ${w.table} WHERE ${w.key}=$1`,[row[w.key]]); });
    for (const role of ["scout", "manager"]) await check(`${w.path}: ${role} write forbidden`, async () => { await request(role,`/api/${w.path}`,403,"POST",w.body); });
    await check(`${w.path}: invalid write`, async () => { await request("admin",`/api/${w.path}`,400,"POST",{}); });
  }
  for (const resource of ["needs","roster"]) {
    await check(`${resource}: manager read`, async () => { await request("manager",`/api/teams/${team}/${resource}`,200); });
    await check(`${resource}: admin read`, async () => { await request("admin",`/api/teams/${team}/${resource}`,200); });
    for (const role of ["scout", "analyst"]) await check(`${resource}: ${role} read forbidden`, async () => { await request(role,`/api/teams/${team}/${resource}`,403); });
    await check(`${resource}: cross-team forbidden`, async () => { await request("manager",`/api/teams/${other}/${resource}`,403); });
    await check(`${resource}: invalid`, async () => { await request("manager",`/api/teams/invalid/${resource}`,400); });
  }
  const needBody = {position:"PG",priority:1,description:"API acceptance fixture"};
  for (const role of ["admin", "manager"]) await check(`needs: ${role} write`, async () => {const row=await request(role,`/api/teams/${team}/needs`,201,"POST",needBody); await pool.query("DELETE FROM team_need WHERE need_id=$1",[row.need_id]);});
  for (const role of ["scout", "analyst"]) await check(`needs: ${role} write forbidden`, async () => {await request(role,`/api/teams/${team}/needs`,403,"POST",needBody);});
  await check("needs: cross-team write forbidden", async () => {await request("manager",`/api/teams/${other}/needs`,403,"POST",needBody);});
  await check("needs: invalid write", async () => {await request("admin",`/api/teams/${team}/needs`,400,"POST",{});});
  for (const [name,path,role,status] of [["own",`/api/team-match?teamId=${team}`,"manager",200],["cross-team",`/api/team-match?teamId=${other}`,"manager",403],["admin",`/api/team-match?teamId=${team}`,"admin",200],["scout",`/api/team-match?teamId=${team}`,"scout",403],["analyst",`/api/team-match?teamId=${team}`,"analyst",403],["invalid","/api/team-match?teamId=bad","admin",400]] as const) await check(`team-match: ${name}`,async()=>{await request(role,path,status);});
  const roster=(await pool.query("SELECT roster_id, season FROM roster WHERE team_id=$1 AND NOT is_historical ORDER BY roster_id LIMIT 1",[team])).rows[0];
  if (!roster) throw new Error("Manager needs an app-managed roster");
  const candidates=(await pool.query("SELECT player_id FROM player p WHERE NOT EXISTS (SELECT 1 FROM roster_player rp WHERE rp.player_id=p.player_id AND rp.season=$1) ORDER BY player_id LIMIT 16",[roster.season])).rows.map(r=>String(r.player_id));
  const existing=Number((await pool.query("SELECT count(*) FROM roster_player WHERE roster_id=$1",[roster.roster_id])).rows[0].count);
  const rosterBody={roster_id:String(roster.roster_id),player_id:candidates[0]};
  for (const role of ["scout", "analyst"]) {
    await check(`roster: ${role} add forbidden`,async()=>{await request(role,`/api/teams/${team}/roster`,403,"POST",rosterBody);});
    await check(`roster: ${role} delete forbidden`,async()=>{await request(role,`/api/teams/${team}/roster/${candidates[0]}?rosterId=${roster.roster_id}`,403,"DELETE");});
  }
  await check("roster: cross-team add forbidden",async()=>{await request("manager",`/api/teams/${other}/roster`,403,"POST",rosterBody);});
  await check("roster: cross-team delete forbidden",async()=>{await request("manager",`/api/teams/${other}/roster/${candidates[0]}?rosterId=${roster.roster_id}`,403,"DELETE");});
  await check("roster: invalid add",async()=>{await request("admin",`/api/teams/${team}/roster`,400,"POST",{});});
  await check("roster: invalid delete",async()=>{await request("admin",`/api/teams/${team}/roster/invalid?rosterId=${roster.roster_id}`,400,"DELETE");});
  await check("roster: admin add and delete",async()=>{await request("admin",`/api/teams/${team}/roster`,201,"POST",rosterBody); try { await request("admin",`/api/teams/${team}/roster/${candidates[0]}?rosterId=${roster.roster_id}`,200,"DELETE"); } catch (e) { await pool.query("DELETE FROM roster_player WHERE roster_id=$1 AND player_id=$2",[roster.roster_id,candidates[0]]); throw e; }});
  const auditBaseline=(await pool.query("SELECT coalesce(max(audit_id),0) AS id FROM audit_log")).rows[0].id;
  const added:string[]=[];
  try {
    if (candidates.length < 16-existing) throw new Error("Not enough available players to check roster cap");
    for (const candidate of candidates.slice(0,15-existing)) {
      await check(`roster: add ${candidate}`,async()=>{await request("manager",`/api/teams/${team}/roster`,201,"POST",{roster_id:String(roster.roster_id),player_id:candidate});added.push(candidate);});
    }
    await check("roster: cap",async()=>{await request("manager",`/api/teams/${team}/roster`,422,"POST",{roster_id:String(roster.roster_id),player_id:candidates[15-existing]});});
    if (added.length) await check("roster: insert audit actor",async()=>{const row=await pool.query("SELECT 1 FROM audit_log WHERE table_name='roster_player' AND action='INSERT' AND changed_by=$1 AND new_data->>'roster_id'=$2 AND new_data->>'player_id'=$3 AND audit_id > $4",[actor,String(roster.roster_id),added[0],auditBaseline]);if(!row.rowCount)throw new Error("audit actor missing");});
  } finally {
    for (const id of added) await check(`roster: remove ${id}`,async()=>{await request("manager",`/api/teams/${team}/roster/${id}?rosterId=${roster.roster_id}`,200,"DELETE");});
  }
  if (added.length) await check("roster: delete audit actor",async()=>{const row=await pool.query("SELECT 1 FROM audit_log WHERE table_name='roster_player' AND action='DELETE' AND changed_by=$1 AND old_data->>'roster_id'=$2 AND old_data->>'player_id'=$3 AND audit_id > $4",[actor,String(roster.roster_id),added[0],auditBaseline]);if(!row.rowCount)throw new Error("audit actor missing");});
}
main().catch(error=>{results.push({check:"setup",result:`FAIL: ${error instanceof Error ? error.message : error}`});}).finally(async()=>{console.table(results);const failures=results.filter(r=>r.result!=="PASS").length;console.log(`Results: ${results.length-failures} passed, ${failures} failed`);if(failures)process.exitCode=1;await pool.end();});
