import { NextResponse } from "next/server";
import { ROLES, requireRole } from "@/lib/auth/guard";
import { playerListSchema } from "@/lib/validators/players";
import { listPlayers } from "@/lib/db/players";
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = playerListSchema.safeParse(params);
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid player filters" }, { status: 400 });
  const auth = await requireRole(ROLES); if (auth.error) return auth.error;
  try { return NextResponse.json({ ok: true, data: await listPlayers(input.data) }); }
  catch { return NextResponse.json({ ok: false, error: "Unable to load players" }, { status: 500 }); }
}
