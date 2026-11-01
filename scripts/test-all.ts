import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";

const root=process.cwd();
const required=["PG_HOST","PG_PORT","PG_USER","PG_PASSWORD","PG_DATABASE","JWT_SECRET","DEMO_PASSWORD"] as const;
const missing=required.filter(key=>!process.env[key]);
if(missing.length)throw new Error(`Missing environment variables: ${missing.join(", ")}. See README.md.`);
const database=`draftboard_test_all_${process.pid}_${randomBytes(6).toString("hex")}`;
if(!/^draftboard_test_all_[0-9]+_[a-f0-9]{12}$/.test(database)||database===process.env.PG_DATABASE)throw new Error("Unsafe acceptance database name");
const baseEnv:NodeJS.ProcessEnv={...process.env,PG_DATABASE:database,PGHOST:process.env.PG_HOST,PGPORT:process.env.PG_PORT,PGUSER:process.env.PG_USER,PGPASSWORD:process.env.PG_PASSWORD,PGDATABASE:database};
delete baseEnv.EMBEDDING_FORCE_FAIL;
const admin=new Client({host:process.env.PG_HOST,port:Number(process.env.PG_PORT),user:process.env.PG_USER,password:process.env.PG_PASSWORD,database:process.env.PG_DATABASE});
const results:{suite:string;result:string}[]=[];
let workspace:string|undefined;let created=false;const servers:ChildProcess[]=[];
function run(command:string,args:string[],env:NodeJS.ProcessEnv,cwd=root):Promise<{code:number;output:string}>{return new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{cwd,env,stdio:["ignore","pipe","pipe"],shell:process.platform==="win32"&&command==="npm"});let output="";child.stdout!.on("data",(chunk:Buffer)=>{const text=chunk.toString();output+=text;process.stdout.write(text)});child.stderr!.on("data",(chunk:Buffer)=>{const text=chunk.toString();output+=text;process.stderr.write(text)});child.once("error",reject);child.once("close",code=>resolvePromise({code:code??1,output}));});}
async function requireSuccess(command:string,args:string[],env:NodeJS.ProcessEnv){const r=await run(command,args,env);if(r.code!==0)throw new Error(`${command} ${args[0]} failed with exit code ${r.code}`);}
async function port():Promise<number>{return new Promise((resolvePromise,reject)=>{const socket=createServer();socket.once("error",reject);socket.listen(0,"127.0.0.1",()=>{const value=socket.address();if(!value||typeof value==="string"){socket.close();reject(new Error("Unable to allocate port"));return;}socket.close(e=>e?reject(e):resolvePromise(value.port));});});}
async function makeApp(dir:string){await mkdir(dir,{recursive:true});for(const entry of ["app","components","lib","middleware.ts","next-env.d.ts","next.config.ts","package.json","package-lock.json","postcss.config.mjs","tailwind.config.ts","tsconfig.json"])await cp(join(root,entry),join(dir,entry),{recursive:true});await symlink(join(root,"node_modules"),join(dir,"node_modules"),process.platform==="win32"?"junction":"dir");}
function startServer(dir:string,portNumber:number,forced:boolean){const env:NodeJS.ProcessEnv={...baseEnv,NODE_ENV:"development",NEXT_DIST_DIR:".next",...(forced?{EMBEDDING_FORCE_FAIL:"1"}:{})};const child=spawn(process.execPath,[join(root,"node_modules/next/dist/bin/next"),"dev","-H","127.0.0.1","-p",String(portNumber)],{cwd:dir,env,detached:process.platform!=="win32",stdio:["ignore","pipe","pipe"]});servers.push(child);child.stdout?.on("data",(c:Buffer)=>process.stdout.write(`[${forced?"failure":"normal"} server] ${c}`));child.stderr?.on("data",(c:Buffer)=>process.stderr.write(`[${forced?"failure":"normal"} server] ${c}`));return child;}
async function ready(child:ChildProcess,portNumber:number){const deadline=Date.now()+90000;while(Date.now()<deadline){if(child.exitCode!==null||child.signalCode!==null)throw new Error(`Test server exited before becoming ready (${child.exitCode??child.signalCode})`);try{const r=await fetch(`http://127.0.0.1:${portNumber}/api/health`,{signal:AbortSignal.timeout(1500)});if(r.ok&&(await r.json()).ok)return;}catch{}await delay(500);}throw new Error("Timed out waiting for test server");}
async function stopServer(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;const exited=new Promise<void>(resolvePromise=>child.once("exit",()=>resolvePromise()));if(process.platform==="win32"){await run("taskkill",["/pid",String(child.pid),"/T","/F"],process.env);}else if(child.pid){try{process.kill(-child.pid,"SIGTERM")}catch(e){if((e as NodeJS.ErrnoException).code!=="ESRCH")throw e;}}await Promise.race([exited,delay(5000)]);if(child.exitCode===null&&child.signalCode===null&&child.pid&&process.platform!=="win32"){try{process.kill(-child.pid,"SIGKILL")}catch(e){if((e as NodeJS.ErrnoException).code!=="ESRCH")throw e;}await Promise.race([exited,delay(3000)]);}}
function summary(suite:string,result:{code:number;output:string}){const match=suite==="Vitest"?result.output.match(/Tests\s+(\d+) passed(?:\s*\((\d+)\))?/):result.output.match(/Results:\s*(\d+) passed,\s*(\d+) failed/);results.push({suite,result:result.code===0?`PASS${match?` (${match[1]} passed)`:""}`:`FAIL (exit ${result.code}${match&&suite!=="Vitest"?`, ${match[2]} failed`:""})`});}
async function main(){
 let setupError:unknown;
 try{
  console.log("\n=== Vitest ===");summary("Vitest",await run("npm",["test"],process.env));
  await admin.connect();await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
  workspace=await mkdtemp(join(tmpdir(),"draftboard-test-all-"));const seedDir=join(workspace,"seed");
  const env={...baseEnv,DRAFTBOARD_SEED_OUTPUT_DIR:seedDir,TEST_REPORTS_PATH:join(seedDir,"reports.json")};
  console.log("\n=== Seed isolated acceptance database ===");
  await requireSuccess("psql",["-v","ON_ERROR_STOP=1","-d",database,...["db/postgres/00_extensions.sql","db/postgres/01_schema.sql","db/postgres/02_alter_demo.sql","db/postgres/03_views.sql","db/postgres/04_functions.sql","db/postgres/05_triggers.sql","db/import/00_staging.sql","db/import/01_load.sql","db/import/02_transform.sql","db/postgres/06_seed.sql"].flatMap(f=>["-f",f])],env);
  await requireSuccess("npm",["run","text:generate"],env);await requireSuccess("npm",["run","embed","--","--missing"],env);await requireSuccess("npm",["run","vector:indexes"],env);
  const normalDir=join(workspace,"normal"),failureDir=join(workspace,"failure");await Promise.all([makeApp(normalDir),makeApp(failureDir)]);
  const normalPort=await port(),failurePort=await port();if(normalPort===failurePort)throw new Error("Could not allocate distinct test ports");const normal=startServer(normalDir,normalPort,false);await ready(normal,normalPort);const forced=startServer(failureDir,failurePort,true);await ready(forced,failurePort);
  const suiteEnv={...env,TEST_BASE_URL:`http://127.0.0.1:${normalPort}`,TEST_FAIL_BASE_URL:`http://127.0.0.1:${failurePort}`};
  console.log("\n=== API acceptance ===");summary("API",await run("npm",["run","check:api"],suiteEnv));
  console.log("\n=== Browser acceptance ===");summary("UI",await run("npm",["run","check:ui"],suiteEnv));
 }catch(e){setupError=e;console.error("Test orchestration failed:",e instanceof Error?e.message:e);}
 finally{
  for(const child of servers.reverse())try{await stopServer(child)}catch(e){setupError??=e;console.error("Test server cleanup failed:",e)}
  if(created)try{await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);created=false}catch(e){setupError??=e;console.error(`Could not remove test database ${database}:`,e)}
  await admin.end().catch(()=>{});if(workspace)try{await rm(workspace,{recursive:true,force:true})}catch(e){setupError??=e;console.error("Temporary workspace cleanup failed:",e)}
 }
 for(const suite of ["Vitest","API","UI"])if(!results.some(r=>r.suite===suite))results.push({suite,result:"NOT RUN"});
 console.log("\n=== Test suite summary ===");console.table(results);if(setupError||results.some(r=>!r.result.startsWith("PASS")))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
