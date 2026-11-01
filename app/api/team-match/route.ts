import { NextResponse } from "next/server";
import { requireOwnTeam } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { getTeamMatch } from "@/lib/db/team-match";

export async function GET(request: Request) {
  const teamId = teamIdSchema.safeParse(new URL(request.url).searchParams.get("teamId"));
  if (!teamId.success) return NextResponse.json({ ok: false, error: "Invalid team ID" }, { status: 400 });
  const auth = await requireOwnTeam(teamId.data);
  if (auth.error) return auth.error;
  try {
    const rows = await getTeamMatch(teamId.data);
    if (rows === null) return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load team matches" }, { status: 500 });
  }
}
