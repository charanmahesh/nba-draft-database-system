import { teamStub } from "@/lib/auth/team-stub";
export async function POST(_request: Request, context: { params: Promise<{ teamId: string }> }) { return teamStub(context); }
