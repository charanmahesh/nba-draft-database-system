import { neighbours } from "@/lib/api/neighbours";
import { relatedNews } from "@/lib/db/documents";
export async function GET(r:Request,c:{params:Promise<{id:string}>}){return neighbours(r,(await c.params).id,relatedNews);}
