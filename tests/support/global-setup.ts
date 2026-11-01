import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" { export interface ProvidedContext { testDatabase: string } }
const required=["PG_HOST","PG_PORT","PG_USER","PG_PASSWORD","PG_DATABASE"] as const;
function settings(database:string) { return {host:process.env.PG_HOST,port:Number(process.env.PG_PORT),user:process.env.PG_USER,password:process.env.PG_PASSWORD,database}; }
export default async function setup(project:TestProject) {
  const missing=required.filter(key=>!process.env[key]);
  if(missing.length)throw new Error(`Missing test database connection settings: ${missing.join(", ")}`);
  const name=`draftboard_test_${process.pid}_${randomBytes(6).toString("hex")}`;
  if(!/^draftboard_test_[0-9]+_[a-f0-9]{12}$/.test(name)||name===process.env.PG_DATABASE)throw new Error("Unsafe test database name");
  const admin=new Client(settings(process.env.PG_DATABASE!));await admin.connect();let created=false;
  async function destroy(){if(!created)return;await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);created=false;}
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);created=true;
    const db=new Client(settings(name));await db.connect();
    try { for(const file of ["00_extensions.sql","01_schema.sql","02_alter_demo.sql","03_views.sql","04_functions.sql","05_triggers.sql","phase8_test_seed.sql"])await db.query(await readFile(new URL(`../../db/postgres/${file}`,import.meta.url),"utf8")); }
    finally {await db.end();}
    project.provide("testDatabase",name);
  } catch(e) {try{await destroy()}finally{await admin.end()}throw e;}
  return async()=>{try{await destroy()}finally{await admin.end()}};
}
