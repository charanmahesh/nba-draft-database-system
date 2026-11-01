import { list } from "@/lib/api/core"; import { teams } from "@/lib/db/core";
export async function GET(request: Request) { return list(request, teams); }
