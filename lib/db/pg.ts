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

/** Run an audited write with the authenticated actor scoped to this transaction. */
export async function withUserTx<T>(personId: string, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [personId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
