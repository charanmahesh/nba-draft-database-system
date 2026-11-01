import { NextResponse } from "next/server";
import { failure } from "@/lib/api/core";
import { requireRole, ROLES } from "@/lib/auth/guard";
import { newsCreate } from "@/lib/validators/documents";
import { createNews, getNews, indexNews, listNews } from "@/lib/db/documents";
export async function GET(r:Request) { const {pageSchema}=await import("@/lib/validators/core");const {teamIdSchema}=await import("@/lib/validators/auth");const v=pageSchema.extend({playerId:teamIdSchema.optional()}).strict().safeParse(Object.fromEntries(new URL(r.url).searchParams));if(!v.success)return NextResponse.json({ok:false,error:"Invalid filters"},{status:400});const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{return NextResponse.json({ok:true,data:await listNews(v.data.page,v.data.limit,v.data.playerId??null)});}catch(e){return failure(e);}}
export async function POST(r:Request) { const v=newsCreate.safeParse(await r.json().catch(()=>null)); if(!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400}); const auth=await requireRole(["admin"]); if(auth.error)return auth.error; try {const id=await createNews(v.data); await indexNews(id); return NextResponse.json({ok:true,data:await getNews(id)},{status:201});}catch(e){return failure(e);} }
