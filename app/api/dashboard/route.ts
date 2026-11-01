import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth/guard";
import { getDashboard } from "@/lib/db/dashboard";
import { failure } from "@/lib/api/core";
export async function GET(request:Request){if(new URL(request.url).search)return NextResponse.json({ok:false,error:"Invalid input"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await getDashboard(auth.session.person_id)});}catch(e){return failure(e);}}
