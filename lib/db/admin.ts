import { pool } from "./pg";
import bcrypt from "bcryptjs";
import type { z } from "zod";
import type { personCreate,teamCreate,teamEdit } from "../validators/admin";
export async function createTeam(v:z.infer<typeof teamCreate>){return (await pool.query("INSERT INTO team (team_name,city) VALUES ($1,$2) RETURNING team_id,team_name,city",[v.team_name,v.city])).rows[0];}
export async function updateTeam(id:string,v:z.infer<typeof teamEdit>){return (await pool.query("UPDATE team SET team_name=coalesce($2,team_name),city=coalesce($3,city) WHERE team_id=$1 RETURNING team_id,team_name,city",[id,v.team_name??null,v.city??null])).rows[0]??null;}
export async function createPerson(v:z.infer<typeof personCreate>){
 const hash=await bcrypt.hash(v.password,10),client=await pool.connect();
 try {await client.query("BEGIN");const result=await client.query("INSERT INTO person (f_name,l_name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING person_id,f_name,l_name,email,role",[v.f_name,v.l_name,v.email,hash,v.role]);const row=result.rows[0];
 if(v.role!==v.subtype.role)throw Object.assign(new Error("Role and subtype differ"),{code:"SUBTYPE_MISMATCH"});
 switch(v.subtype.role){case "admin":await client.query("INSERT INTO admin (person_id) VALUES ($1)",[row.person_id]);break;case "scout":await client.query("INSERT INTO scout (person_id,experience) VALUES ($1,$2)",[row.person_id,v.subtype.experience??null]);break;case "analyst":await client.query("INSERT INTO analyst (person_id,specialization) VALUES ($1,$2)",[row.person_id,v.subtype.specialization??null]);break;case "team_manager":await client.query("INSERT INTO team_manager (person_id,team_id) VALUES ($1,$2)",[row.person_id,v.subtype.team_id]);break;}
 await client.query("COMMIT");return row;
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
