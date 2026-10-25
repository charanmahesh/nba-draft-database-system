import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var draftBoardPool: Pool | undefined;
}

export const pool =
  globalThis.draftBoardPool ??
  new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? "5432"),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });

if (process.env.NODE_ENV !== "production") globalThis.draftBoardPool = pool;
