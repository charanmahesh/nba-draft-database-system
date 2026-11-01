import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { teamEdit } from "@/lib/validators/admin";
import { updateTeam } from "@/lib/db/admin";
import { failure } from "@/lib/api/core";
export async function PATCH(r:Request,c:{params:Promise<{teamId:string}>}){const id=teamIdSchema.safeParse((await c.params).teamId),v=teamEdit.safeParse(await r.json().catch(()=>null));if(!id.success||!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400});const auth=await requireRole(["admin"]);if(auth.error)return auth.error;try{const data=await updateTeam(id.data,v.data);return data?NextResponse.json({ok:true,data}):NextResponse.json({ok:false,error:"Team not found"},{status:404});}catch(e){return failure(e);}}
