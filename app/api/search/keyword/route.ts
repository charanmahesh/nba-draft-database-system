import { NextResponse } from "next/server";
import { ROLES, requireRole } from "@/lib/auth/guard";
import { querySchema } from "@/lib/validators/search";
import { keyword } from "@/lib/db/search";
export async function GET(r:Request){const v=querySchema.safeParse(Object.fromEntries(new URL(r.url).searchParams));if(!v.success)return NextResponse.json({ok:false,error:"Invalid search parameters"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await keyword(v.data.q,v.data.k)});}catch{return NextResponse.json({ok:false,error:"Unable to search reports"},{status:500});}}
