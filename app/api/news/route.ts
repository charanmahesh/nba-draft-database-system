import { NextResponse } from "next/server";
import { list, failure } from "@/lib/api/core";
import { requireRole } from "@/lib/auth/guard";
import { newsCreate } from "@/lib/validators/documents";
import { createNews, getNews, indexNews, listNews } from "@/lib/db/documents";
export async function GET(r:Request) { return list(r,listNews); }
export async function POST(r:Request) { const v=newsCreate.safeParse(await r.json().catch(()=>null)); if(!v.success)return NextResponse.json({ok:false,error:"Invalid input"},{status:400}); const auth=await requireRole(["admin"]); if(auth.error)return auth.error; try {const id=await createNews(v.data); await indexNews(id); return NextResponse.json({ok:true,data:await getNews(id)},{status:201});}catch(e){return failure(e);} }
