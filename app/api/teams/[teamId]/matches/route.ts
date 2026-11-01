import { teamStub } from "@/lib/auth/team-stub";
export async function GET(_request: Request, context: { params: Promise<{ teamId: string }> }) { return teamStub(context); }
