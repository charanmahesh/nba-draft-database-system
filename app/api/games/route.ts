import { list } from "@/lib/api/core"; import { games } from "@/lib/db/core";
export async function GET(request: Request) { return list(request, games); }
