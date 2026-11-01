import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { newsEdit } from "@/lib/validators/documents";
import { getNews, updateNews, indexNews, deleteNews } from "@/lib/db/documents";
import { failure } from "@/lib/api/core";
type Context={params:Promise<{id:string}>};
const invalid=()=>NextResponse.json({ok:false,error:"Invalid input"},{status:400});
const missing=()=>NextResponse.json({ok:false,error:"Article not found"},{status:404});
export async function GET(_r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id);if(!id.success)return invalid();const auth=await requireRole(ROLES);if(auth.error)return auth.error;try{const data=await getNews(id.data);return data?NextResponse.json({ok:true,data}):missing();}catch(e){return failure(e);}}
export async function PATCH(r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id),v=newsEdit.safeParse(await r.json().catch(()=>null));if(!id.success||!v.success)return invalid();const auth=await requireRole(["admin"]);if(auth.error)return auth.error;try{if(!await getNews(id.data))return missing();await updateNews(id.data,v.data);if(v.data.summary!==undefined||v.data.title!==undefined)await indexNews(id.data);return NextResponse.json({ok:true,data:await getNews(id.data)});}catch(e){return failure(e);}}
export async function DELETE(_r:Request,c:Context){const id=teamIdSchema.safeParse((await c.params).id);if(!id.success)return invalid();const auth=await requireRole(["admin"]);if(auth.error)return auth.error;try{const row=await getNews(id.data);if(!row)return missing();await deleteNews(id.data);return NextResponse.json({ok:true,data:row});}catch(e){return failure(e);}}
