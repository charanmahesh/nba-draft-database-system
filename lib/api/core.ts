import { NextResponse } from "next/server";
import { z } from "zod";
import { ROLES, requireRole } from "../auth/guard";
import { pageSchema } from "../validators/core";
export function failure(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code: unknown }).code : null;
  if (code === "SUBTYPE_MISMATCH") return NextResponse.json({ ok: false, error: "Role and subtype must match" }, { status: 422 });
  if (code === "HISTORICAL") return NextResponse.json({ ok: false, error: "Historical rosters cannot be modified" }, { status: 422 });
  if (code === "23514" && error instanceof Error && /cannot contain more than 15 players/.test(error.message)) return NextResponse.json({ ok: false, error: "Roster cannot contain more than 15 players" }, { status: 422 });
  if (code === "23514" && error instanceof Error && /did not participate in game/.test(error.message)) return NextResponse.json({ ok: false, error: "The selected team did not play in this game" }, { status: 422 });
  if (code === "23505") {
    const constraint = typeof error === "object" && error !== null && "constraint" in error ? (error as {constraint:unknown}).constraint : null;
    const message = constraint === "uq_game_performance_game_player" ? "This player already has a performance for this game" : constraint === "uq_roster_player_player_season" ? "This player is already on a roster for this season" : constraint === "uq_combined_measurement" ? "This measurement already exists for the player and year" : "Record already exists";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
  if (code === "23503") return NextResponse.json({ ok: false, error: "Referenced record does not exist" }, { status: 409 });
  if (code === "23514" || code === "23502" || code === "22003" || code === "P0001") return NextResponse.json({ ok: false, error: "Record violates a database rule" }, { status: 422 });
  return NextResponse.json({ ok: false, error: "Database request failed" }, { status: 500 });
}
export async function list(request: Request, fn: (page: number, limit: number) => Promise<unknown>) {
  const input = pageSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid pagination" }, { status: 400 });
  const auth = await requireRole(ROLES); if (auth.error) return auth.error;
  try { return NextResponse.json({ ok: true, data: await fn(input.data.page, input.data.limit) }); } catch (error) { return failure(error); }
}
export async function create<T>(request: Request, schema: z.ZodType<T>, fn: (value: T) => Promise<unknown>) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  const auth = await requireRole(["admin", "analyst"]); if (auth.error) return auth.error;
  try { return NextResponse.json({ ok: true, data: await fn(input.data) }, { status: 201 }); } catch (error) { return failure(error); }
}
