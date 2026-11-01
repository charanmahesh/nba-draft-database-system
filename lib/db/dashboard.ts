import { pool } from "./pg";
export async function getDashboard(personId:string){return (await pool.query("SELECT fn_dashboard($1) AS dashboard",[personId])).rows[0].dashboard;}
