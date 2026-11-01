import { NextResponse } from "next/server";
import { list, failure } from "@/lib/api/core";
import { requireRole } from "@/lib/auth/guard";
import { reportCreate } from "@/lib/validators/documents";
import { createReport, getReport, indexReport, listReports } from "@/lib/db/documents";
export async function GET(r:Request) { return list(r,listReports); }
export async function POST(r:Request) { const v=reportCreate.safeParse(await r.json().catch(()=>null)); if(!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400}); const auth=await requireRole(["admin","scout"]); if(auth.error)return auth.error; if(auth.session.role==="scout" && v.data.scout_id && v.data.scout_id!==auth.session.person_id)return NextResponse.json({ok:false,error:"Forbidden"},{status:403}); const scout=auth.session.role==="scout"?auth.session.person_id:v.data.scout_id; if(!scout)return NextResponse.json({ok:false,error:"scout_id is required"},{status:400}); try {const id=await createReport(v.data,scout); await indexReport(id); return NextResponse.json({ok:true,data:await getReport(id)},{status:201});}catch(e){return failure(e);} }
