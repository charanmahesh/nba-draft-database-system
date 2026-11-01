import { neighbours } from "@/lib/api/neighbours";
import { similarPlayers } from "@/lib/db/search";
export async function GET(r:Request,c:{params:Promise<{id:string}>}){return neighbours(r,(await c.params).id,similarPlayers);}
