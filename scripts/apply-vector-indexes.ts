import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../lib/db/pg";

async function main(): Promise<void> {
  const requiredVariables = [
    "PG_HOST",
    "PG_PORT",
    "PG_USER",
    "PG_PASSWORD",
    "PG_DATABASE",
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing PostgreSQL environment variables: ${missingVariables.join(", ")}`,
    );
  }

  const sqlPath = resolve(process.cwd(), "db", "postgres", "08_vector_indexes.sql");
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
  console.log("Created Phase 3C HNSW vector indexes.");
}

main()
  .catch((error: unknown) => {
    console.error("Creating vector indexes failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
