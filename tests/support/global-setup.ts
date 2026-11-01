import "dotenv/config";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" { export interface ProvidedContext { testDatabase: string; importTestDatabase:string } }
const required=["PG_HOST","PG_PORT","PG_USER","PG_PASSWORD","PG_DATABASE"] as const;
function settings(database:string) { return {host:process.env.PG_HOST,port:Number(process.env.PG_PORT),user:process.env.PG_USER,password:process.env.PG_PASSWORD,database}; }
export default async function setup(project:TestProject) {
  const missing=required.filter(key=>!process.env[key]);
  if(missing.length)throw new Error(`Missing test database connection settings: ${missing.join(", ")}`);
  const name=`draftboard_test_${process.pid}_${randomBytes(6).toString("hex")}`;
  if(!/^draftboard_test_[0-9]+_[a-f0-9]{12}$/.test(name)||name===process.env.PG_DATABASE)throw new Error("Unsafe test database name");
  const importName=`${name}_import`;
  if(importName===process.env.PG_DATABASE)throw new Error("Unsafe import database name");
  const admin=new Client(settings(process.env.PG_DATABASE!));await admin.connect();const created:string[]=[];
  async function destroy(){while(created.length){const target=created[created.length-1];if(target!==name&&target!==importName)throw new Error("Unsafe database teardown");await admin.query(`DROP DATABASE "${target}" WITH (FORCE)`);created.pop();}}
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);created.push(name);
    const db=new Client(settings(name));await db.connect();
    try { for(const file of ["00_extensions.sql","01_schema.sql","02_alter_demo.sql","03_views.sql","04_functions.sql","05_triggers.sql","phase8_test_seed.sql"])await db.query(await readFile(new URL(`../../db/postgres/${file}`,import.meta.url),"utf8")); }
    finally {await db.end();}
    await admin.query(`CREATE DATABASE "${importName}" TEMPLATE template0`);created.push(importName);
    const importDb=new Client(settings(importName));await importDb.connect();
    try { for(const file of ["00_extensions.sql","01_schema.sql","02_alter_demo.sql","03_views.sql","04_functions.sql","05_triggers.sql"])await importDb.query(await readFile(new URL(`../../db/postgres/${file}`,import.meta.url),"utf8")); }
    finally {await importDb.end();}
    const env={...process.env,PGHOST:process.env.PG_HOST,PGPORT:process.env.PG_PORT,PGUSER:process.env.PG_USER,PGPASSWORD:process.env.PG_PASSWORD,PGDATABASE:importName};
    if(env.PGDATABASE===process.env.PG_DATABASE||env.PGDATABASE!==importName)throw new Error("Refusing to import into a non-test database");
    try {await promisify(execFile)("psql",["-v","ON_ERROR_STOP=1","-d",importName,"-f","db/import/00_staging.sql","-f","db/import/01_load.sql","-f","db/import/02_transform.sql"],{cwd:process.cwd(),env,timeout:300000,maxBuffer:1024*1024});}
    catch(e){throw new Error(`Test import failed; install psql and provide the documented local dataset CSVs. ${e instanceof Error?e.message:String(e)}`);}
    project.provide("testDatabase",name);
    project.provide("importTestDatabase",importName);
  } catch(e) {try{await destroy()}finally{await admin.end()}throw e;}
  return async()=>{try{await destroy()}finally{await admin.end()}};
}
