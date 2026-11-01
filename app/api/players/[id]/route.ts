import { NextResponse } from "next/server";
import { ROLES, requireRole } from "@/lib/auth/guard";
import { teamIdSchema } from "@/lib/validators/auth";
import { getPlayer } from "@/lib/db/players";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = teamIdSchema.safeParse((await context.params).id);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid player ID" }, { status: 400 });
  const auth = await requireRole(ROLES); if (auth.error) return auth.error;
  try { const data = await getPlayer(id.data); return data ? NextResponse.json({ ok: true, data }) : NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 }); }
  catch { return NextResponse.json({ ok: false, error: "Unable to load player" }, { status: 500 }); }
}
