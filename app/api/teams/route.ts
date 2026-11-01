import { list } from "@/lib/api/core"; import { teams } from "@/lib/db/core";
export async function GET(request: Request) { return list(request, teams); }

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { teamCreate } from "@/lib/validators/admin";
import { createTeam } from "@/lib/db/admin";
import { failure } from "@/lib/api/core";
export async function POST(r:Request){const v=teamCreate.safeParse(await r.json().catch(()=>null));if(!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400});const auth=await requireRole(["admin"]);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await createTeam(v.data)},{status:201});}catch(e){return failure(e);}}
