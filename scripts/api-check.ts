import "dotenv/config";
import { pool } from "../lib/db/pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
const execFileAsync = promisify(execFile);

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD;
const failBase = process.env.TEST_FAIL_BASE_URL;
const results: { check: string; result: string }[] = [];
const cookies: Record<string, string> = {};
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({check:name, result:"PASS"}); }
  catch (error) { results.push({check:name, result:`FAIL: ${error instanceof Error ? error.message : error}`}); }
}
async function request(role: string, path: string, status: number, method = "GET", body?: unknown, target = base) {
  const response = await fetch(`${target}${path}`, {method, headers: {cookie:cookies[role] ?? "", "content-type":"application/json"}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
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
  for (const [name,path,role,status] of [["own",`/api/teams/${team}/matches`,"manager",200],["cross-team",`/api/teams/${other}/matches`,"manager",403],["scout",`/api/teams/${team}/matches`,"scout",403],["analyst",`/api/teams/${team}/matches`,"analyst",403],["invalid","/api/teams/bad/matches","admin",400]] as const) await check(`team matches alias: ${name}`,async()=>{await request(role,path,status);});
  await documentChecks(player);
  await searchChecks();
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
async function searchChecks() {
  const labels=JSON.parse(await readFile("db/seed/reports.json","utf8")) as {reports:{report_id:string;archetype:string}[]};
  const demos=[["protects the basket from opposing layups","rim_protector"],["facilitator who sets up teammates","playmaking_guard"],["lockdown perimeter defender","defensive_stopper"]] as const;
  const ordered=(rows:{similarity:number}[])=>rows.every((row,i)=>i===0||Number(rows[i-1].similarity)>=Number(row.similarity));
  for(const [query,archetype] of demos) await check(`search demo: ${archetype}`,async()=>{const q=encodeURIComponent(query);const keyword=await request("scout",`/api/search/keyword?q=${q}&k=5`,200);const semantic=await request("scout",`/api/search/reports?q=${q}&k=5`,200);const relevant=new Set(labels.reports.filter(r=>r.archetype===archetype).map(r=>r.report_id));if(keyword.length!==0||semantic.length!==5||!ordered(semantic)||semantic.filter((r:{report_id:string})=>relevant.has(String(r.report_id))).length<3)throw new Error("expected no keyword hits and at least 3 relevant ordered semantic hits");});
  await check("search: position filter and k",async()=>{const rows=await request("analyst","/api/search/reports?q=guard&position=PG&k=3",200);if(rows.length!==3||!ordered(rows)||rows.some((r:{position:string})=>r.position!=="PG"))throw new Error("position, k or order incorrect");});
  await check("search: injury filter",async()=>{const sample=await request("scout","/api/search/reports?q=guard&k=1",200);if(sample.length!==1)throw new Error("no fixture report");const player=String(sample[0].player_id);const injury=await pool.query("INSERT INTO injury_history (player_id,injury_date,description,severity) VALUES ($1,'2026-01-01','API filter fixture','severe') RETURNING injury_id",[player]);try{const rows=await request("scout","/api/search/reports?q=guard&maxInjurySeverity=moderate&k=100",200);if(rows.some((r:{player_id:string})=>String(r.player_id)===player))throw new Error("severe injury not excluded");}finally{await pool.query("DELETE FROM injury_history WHERE injury_id=$1",[injury.rows[0].injury_id]);}});
  const source=await pool.query("SELECT report_id,player_id FROM scouting_report WHERE embedding IS NOT NULL ORDER BY report_id LIMIT 1");const report=String(source.rows[0].report_id),player=String(source.rows[0].player_id);
  await check("similar reports: k, order and exclusion",async()=>{const rows=await request("scout",`/api/reports/${report}/similar?k=3`,200);if(rows.length!==3||!ordered(rows)||rows.some((r:{report_id:string})=>String(r.report_id)===report))throw new Error("invalid neighbours");});
  await check("similar players: k, order and exclusion",async()=>{const rows=await request("scout",`/api/players/${player}/similar?k=3`,200);if(rows.length!==3||!ordered(rows)||rows.some((r:{player_id:string})=>String(r.player_id)===player))throw new Error("invalid neighbours");});
  await check("player news: exact mention and semantic results",async()=>{const fixture=await pool.query("SELECT m.player_id, m.article_id FROM article_mention m WHERE EXISTS (SELECT 1 FROM scouting_report r WHERE r.player_id=m.player_id AND r.embedding IS NOT NULL) ORDER BY m.article_id LIMIT 1");const id=String(fixture.rows[0].player_id),article=String(fixture.rows[0].article_id);const rows=await request("scout",`/api/players/${id}/news?k=100`,200);if(!rows.length||!rows.some((r:{article_id:string;exact_mention:boolean})=>String(r.article_id)===article&&r.exact_mention)||!rows.some((r:{similarity:number|null})=>r.similarity!==null))throw new Error("missing exact mention or semantic results");});
  await check("player news: k and similarity order",async()=>{const rows=await request("scout",`/api/players/${player}/news?k=3`,200);if(rows.length!==3||!ordered(rows))throw new Error("invalid news order or limit");});
  await check("keyword: rank and headline",async()=>{const rows=await request("scout","/api/search/keyword?q=guard&k=3",200);if(!rows.length||rows.some((r:{rank:number;headline:string},i:number)=>!r.headline.includes("<mark>")||(i>0&&Number(rows[i-1].rank)<Number(r.rank))))throw new Error("missing headline or rank order");});
  for(const path of ["/api/search/reports?q=", "/api/search/reports?q=guard&position=invalid", "/api/search/reports?q=guard&maxInjurySeverity=invalid", "/api/search/keyword?q=", `/api/reports/${report}/similar?k=0`, `/api/players/${player}/similar?k=101`, `/api/players/${player}/news?k=bad`]) await check(`search invalid: ${path}`,async()=>{await request("scout",path,400);});
  for(const path of ["/api/search/reports?q=guard", "/api/search/keyword?q=guard", `/api/reports/${report}/similar`, `/api/players/${player}/similar`, `/api/players/${player}/news`]) await check(`search anonymous: ${path}`,async()=>{await request("anonymous",path,401);});
}

async function documentChecks(player:string) {
  if (!failBase) { await check("embedding failure server configured",async()=>{throw new Error("Set TEST_FAIL_BASE_URL to a separate development server started with EMBEDDING_FORCE_FAIL=1");}); return; }
  const scout = await request("scout","/api/auth/me",200);
  const fixture = await pool.connect();
  let otherScout:string | undefined;
  const reportIds:string[]=[]; const articleIds:string[]=[];
  try {
    await fixture.query("BEGIN");
    const person=await fixture.query("INSERT INTO person (f_name,l_name,email,password_hash,role) SELECT 'API','Fixture',$1,password_hash,'scout' FROM person WHERE person_id=$2 RETURNING person_id",[`api-fixture-${Date.now()}@draftboard.local`,scout.person_id]);
    otherScout=String(person.rows[0].person_id);
    await fixture.query("INSERT INTO scout (person_id) VALUES ($1)",[otherScout]);
    await fixture.query("COMMIT");
    const reportBody={player_id:player,summary:"A skilled passing guard who protects the ball."};
    const newsBody={title:"Acceptance fixture",publish_date:"2026-01-01",summary:"A guard creates opportunities for teammates."};
    for (const [kind,role,body,ids,key] of [["reports","scout",reportBody,reportIds,"report_id"],["news","admin",newsBody,articleIds,"article_id"]] as const) {
      let indexed:string | undefined, pending:string | undefined;
      await check(`${kind}: create indexed`,async()=>{const row=await request(role,`/api/${kind}`,201,"POST",body);ids.push(String(row[key]));indexed=String(row[key]);if(row.embedding_status!=="indexed")throw new Error(`expected indexed, got ${row.embedding_status}`);});
      await check(`${kind}: forced failure pending`,async()=>{const row=await request(role,`/api/${kind}`,201,"POST",body,failBase);ids.push(String(row[key]));pending=String(row[key]);if(row.embedding_status!=="pending")throw new Error(`expected pending, got ${row.embedding_status}`);});
      await check(`${kind}: edit clears vector on failure`,async()=>{if(!indexed)throw new Error("indexed fixture missing");const row=await request(role,`/api/${kind}/${indexed}`,200,"PATCH",{summary:"Edited fixture with a different summary."},failBase);if(row.embedding_status!=="pending")throw new Error("stale vector retained");});
      await check(`${kind}: edit re-embeds`,async()=>{if(!indexed)throw new Error("indexed fixture missing");const row=await request(role,`/api/${kind}/${indexed}`,200,"PATCH",{summary:"Another edited fixture with a new summary."});if(row.embedding_status!=="indexed")throw new Error("edit did not index");});
      await check(`${kind}: admin edit`,async()=>{if(!indexed)throw new Error("fixture missing");const row=await request("admin",`/api/${kind}/${indexed}`,200,"PATCH",{summary:"An admin revised this acceptance fixture."});if(row.embedding_status!=="indexed")throw new Error("admin edit did not index");});
      if(kind==="news") await check("news: title edit clears vector",async()=>{if(!indexed)throw new Error("fixture missing");const row=await request("admin",`/api/news/${indexed}`,200,"PATCH",{title:"Changed fixture title"},failBase);if(row.embedding_status!=="pending")throw new Error("title edit retained stale vector");});
      await check(`${kind}: invalid create`,async()=>{await request(role,`/api/${kind}`,400,"POST",{});});
      for(const denied of kind==="reports"?["analyst","manager"]:["scout","analyst","manager"]) await check(`${kind}: ${denied} create forbidden`,async()=>{await request(denied,`/api/${kind}`,403,"POST",body);});
      if(kind==="reports") await check("reports: scout cannot edit another scout",async()=>{const row=await request("admin","/api/reports",201,"POST",{...reportBody,scout_id:otherScout});ids.push(String(row.report_id));await request("scout",`/api/reports/${row.report_id}`,403,"PATCH",{summary:"unauthorized"});});
      await check(`${kind}: backfill pending`,async()=>{if(!pending)throw new Error("pending fixture missing");const env={...process.env};delete env.EMBEDDING_FORCE_FAIL;await execFileAsync("npm",["run","embed","--","--missing"],{env,timeout:180000});const row=await request(role,`/api/${kind}/${pending}`,200);if(row.embedding_status!=="indexed")throw new Error("backfill did not index fixture");});
    }
  } catch(e) { try {await fixture.query("ROLLBACK");}catch{} await check("document fixture setup",async()=>{throw e;}); }
  finally {
    fixture.release();
    for(const id of reportIds) await check(`reports: cleanup ${id}`,async()=>{await request("admin",`/api/reports/${id}`,200,"DELETE");});
    for(const id of articleIds) await check(`news: cleanup ${id}`,async()=>{await request("admin",`/api/news/${id}`,200,"DELETE");});
    if(otherScout) await check("scout fixture cleanup",async()=>{const client=await pool.connect();try{await client.query("BEGIN");await client.query("DELETE FROM scout WHERE person_id=$1",[otherScout]);await client.query("DELETE FROM person WHERE person_id=$1",[otherScout]);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}});
  }
}

main().catch(error=>{results.push({check:"setup",result:`FAIL: ${error instanceof Error ? error.message : error}`});}).finally(async()=>{console.table(results);const failures=results.filter(r=>r.result!=="PASS").length;console.log(`Results: ${results.length-failures} passed, ${failures} failed`);if(failures)process.exitCode=1;await pool.end();});
