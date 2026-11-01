import { NextResponse } from "next/server";
import { requireRole, ROLES } from "../auth/guard";
import { teamIdSchema } from "../validators/auth";
import { neighboursSchema } from "../validators/search";
export async function neighbours(r:Request,id:string,query:(id:string,k:number)=>Promise<unknown[]|null>){const parsedId=teamIdSchema.safeParse(id),v=neighboursSchema.safeParse(Object.fromEntries(new URL(r.url).searchParams));if(!parsedId.success||!v.success)return NextResponse.json({ok:false,error:"Invalid search parameters"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{const data=await query(parsedId.data,v.data.k);return data===null?NextResponse.json({ok:false,error:"Record not found"},{status:404}):NextResponse.json({ok:true,data});}catch{return NextResponse.json({ok:false,error:"Unable to find related records"},{status:500});}}
