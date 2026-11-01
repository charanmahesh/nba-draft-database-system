import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { gameBoxScore } from "@/lib/db/core";
import { failure } from "@/lib/api/core";
export async function GET(_r:Request,c:{params:Promise<{id:string}>}){const id=teamIdSchema.safeParse((await c.params).id);if(!id.success)return NextResponse.json({ok:false,error:"Invalid game ID"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{const data=await gameBoxScore(id.data);return data?NextResponse.json({ok:true,data}):NextResponse.json({ok:false,error:"Game not found"},{status:404});}catch(e){return failure(e);}}
