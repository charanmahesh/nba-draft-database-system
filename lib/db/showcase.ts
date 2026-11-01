import { pool, withUserTx } from "./pg";
export async function showcase(example:string){if(["view_needs","audit","join","having","top","correlated","exists","ranking"].includes(example))return (await pool.query("SELECT fn_showcase_relational($1) AS result",[example])).rows[0].result;return (await pool.query("SELECT fn_showcase_vector_plan($1) AS line",[example])).rows.map(r=>r.line);}

export async function showcaseRollback(actor:string){return withUserTx(actor,async client=>(await client.query("SELECT fn_showcase_rollback() AS result")).rows[0].result);}
