import { NextResponse } from "next/server";
import { requireOwnTeam } from "./guard";
import { teamIdSchema } from "@/lib/validators/auth";
export async function teamStub(context: { params: Promise<{ teamId: string }> }) {
  const input = teamIdSchema.safeParse((await context.params).teamId);
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid team ID" }, { status: 400 });
  const result = await requireOwnTeam(input.data);
  if (result.error) return result.error;
  return NextResponse.json({ ok: false, error: "Not implemented until Phase 6" }, { status: 501 });
}
