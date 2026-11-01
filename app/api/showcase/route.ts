import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guard";
import { showcase, showcaseRollback } from "@/lib/db/showcase";
import { failure } from "@/lib/api/core";
const schema=z.object({example:z.enum(["view_needs","audit","join","having","top","correlated","exists","ranking","without_index","index_available","force_index"])}).strict();
export async function GET(r:Request){const v=schema.safeParse(Object.fromEntries(new URL(r.url).searchParams));if(!v.success)return NextResponse.json({ok:false,error:"Invalid example"},{status:400});const auth=await requireRole(v.data.example==="audit"?["admin"]:["admin","analyst"]);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await showcase(v.data.example)})}catch(e){return failure(e)}}

export async function POST(r:Request){const v=z.object({example:z.literal("rollback")}).strict().safeParse(await r.json().catch(()=>null));if(!v.success)return NextResponse.json({ok:false,error:"Invalid example"},{status:400});const auth=await requireRole(["admin"]);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:[await showcaseRollback(auth.session.person_id)]})}catch(e){return failure(e)}}
