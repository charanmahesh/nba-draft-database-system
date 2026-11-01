import "dotenv/config";
import { Client } from "pg";
import { inject } from "vitest";
export async function connect() {
  const database=inject("testDatabase");
  if(!/^draftboard_test_[0-9]+_[a-f0-9]{12}$/.test(database)||database===process.env.PG_DATABASE)throw new Error("Refusing to connect to a non-test database");
  const client=new Client({host:process.env.PG_HOST,port:Number(process.env.PG_PORT),user:process.env.PG_USER,password:process.env.PG_PASSWORD,database});await client.connect();return client;
}
