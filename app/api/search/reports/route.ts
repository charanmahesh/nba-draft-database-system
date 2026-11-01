import { NextResponse } from "next/server";
import { ROLES, requireRole } from "@/lib/auth/guard";
import { reportSearchSchema } from "@/lib/validators/search";
import { searchReports } from "@/lib/db/search";
export async function GET(r:Request){const v=reportSearchSchema.safeParse(Object.fromEntries(new URL(r.url).searchParams));if(!v.success)return NextResponse.json({ok:false,error:"Invalid search parameters"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await searchReports(v.data)});}catch{return NextResponse.json({ok:false,error:"Unable to search reports"},{status:500});}}
