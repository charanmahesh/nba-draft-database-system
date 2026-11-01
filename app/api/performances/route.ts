import { list, create } from "@/lib/api/core"; import { performances, createPerformance } from "@/lib/db/core"; import { performanceSchema } from "@/lib/validators/core";
export async function GET(request: Request) { return list(request, performances); }
export async function POST(request: Request) { return create(request, performanceSchema, createPerformance); }
