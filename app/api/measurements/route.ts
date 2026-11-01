import { list, create } from "@/lib/api/core"; import { measurements, createMeasurement } from "@/lib/db/core"; import { measurementSchema } from "@/lib/validators/core";
export async function GET(request: Request) { return list(request, measurements); }
export async function POST(request: Request) { return create(request, measurementSchema, createMeasurement); }
