import { list, create } from "@/lib/api/core"; import { injuries, createInjury } from "@/lib/db/core"; import { injurySchema } from "@/lib/validators/core";
export async function GET(request: Request) { return list(request, injuries); }
export async function POST(request: Request) { return create(request, injurySchema, createInjury); }
