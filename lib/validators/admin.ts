import { z } from "zod";
import { teamIdSchema } from "./auth";
const name=z.string().trim().min(1).max(200);
export const teamCreate=z.object({team_name:name,city:name}).strict();
export const teamEdit=teamCreate.partial().refine(v=>Object.keys(v).length>0);
const subtype=z.discriminatedUnion("role",[
 z.object({role:z.literal("admin")}).strict(),
 z.object({role:z.literal("scout"),experience:z.number().int().min(0).max(32767).optional()}).strict(),
 z.object({role:z.literal("analyst"),specialization:name.optional()}).strict(),
 z.object({role:z.literal("team_manager"),team_id:teamIdSchema}).strict(),
]);
export const personCreate=z.object({f_name:name,l_name:name,email:z.email().max(254),password:z.string().min(1).refine(v=>new TextEncoder().encode(v).length<=72),role:z.enum(["admin","scout","analyst","team_manager"]),subtype}).strict();
