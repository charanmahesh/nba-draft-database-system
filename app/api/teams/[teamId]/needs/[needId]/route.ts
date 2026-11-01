import { z } from "zod";
import { NextResponse } from "next/server";
import { requireOwnTeam } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { updateNeed,deleteNeed } from "@/lib/db/team-management";
import { failure } from "@/lib/api/core";
const schema=z.object({position:z.enum(["PG","SG","SF","PF","C"]).optional(),priority:z.number().int().min(1).max(5).optional(),description:z.string().max(5000).optional(),is_filled:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0);
type C={params:Promise<{teamId:string;needId:string}>};
export async function PATCH(r:Request,c:C){const p=await c.params,t=teamIdSchema.safeParse(p.teamId),n=teamIdSchema.safeParse(p.needId),v=schema.safeParse(await r.json().catch(()=>null));if(!t.success||!n.success||!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400});const auth=await requireOwnTeam(t.data);if(auth.error)return auth.error;try{const data=await updateNeed(t.data,n.data,v.data);return data?NextResponse.json({ok:true,data}):NextResponse.json({ok:false,error:"Need not found"},{status:404});}catch(e){return failure(e);}}
export async function DELETE(_r:Request,c:C){const p=await c.params,t=teamIdSchema.safeParse(p.teamId),n=teamIdSchema.safeParse(p.needId);if(!t.success||!n.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400});const auth=await requireOwnTeam(t.data);if(auth.error)return auth.error;try{const data=await deleteNeed(t.data,n.data);return data?NextResponse.json({ok:true,data}):NextResponse.json({ok:false,error:"Need not found"},{status:404});}catch(e){return failure(e);}}
