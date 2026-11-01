import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { reportEdit } from "@/lib/validators/documents";
import { getReport, updateReport, indexReport, deleteReport } from "@/lib/db/documents";
import { failure } from "@/lib/api/core";
type Context={params:Promise<{id:string}>};
const invalid=()=>NextResponse.json({ok:false,error:"Invalid input"},{status:400});
const missing=()=>NextResponse.json({ok:false,error:"Report not found"},{status:404});
export async function GET(_r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id);if(!id.success)return invalid();const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{const data=await getReport(id.data);return data?NextResponse.json({ok:true,data}):missing();}catch(e){return failure(e);}}
export async function PATCH(r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id),v=reportEdit.safeParse(await r.json().catch(()=>null));if(!id.success||!v.success)return invalid();const auth=await requireRole(["admin","scout"]);if(auth.error)return auth.error;try{const row=await getReport(id.data);if(!row)return missing();if(auth.session.role==="scout" && String(row.scout_id)!==auth.session.person_id)return NextResponse.json({ok:false,error:"Forbidden"},{status:403});await updateReport(id.data,v.data.summary);await indexReport(id.data);return NextResponse.json({ok:true,data:await getReport(id.data)});}catch(e){return failure(e);}}
export async function DELETE(_r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id);if(!id.success)return invalid();const auth=await requireRole(["admin","scout"]);if(auth.error)return auth.error;try{const row=await getReport(id.data);if(!row)return missing();if(auth.session.role==="scout" && String(row.scout_id)!==auth.session.person_id)return NextResponse.json({ok:false,error:"Forbidden"},{status:403});await deleteReport(id.data);return NextResponse.json({ok:true,data:row});}catch(e){return failure(e);}}
