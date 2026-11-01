import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pg";
import { SESSION_COOKIE, verifySession } from "./jwt";

export const ROLES = ["admin", "scout", "analyst", "team_manager"] as const;
export type Role = (typeof ROLES)[number];
export interface Session {
  person_id: string;
  name: string;
  email: string;
  role: Role;
  team_id: string | null;
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const personId = token ? await verifySession(token) : null;
  if (!personId) return null;
  const result = await pool.query<Session>(
    `SELECT p.person_id::text, concat_ws(' ', p.f_name, p.l_name) AS name,
            p.email, p.role::text AS role, tm.team_id::text
       FROM person p LEFT JOIN team_manager tm ON tm.person_id = p.person_id
      WHERE p.person_id = $1`,
    [personId],
  );
  return result.rows[0] ?? null;
}

type GuardResult = { session: Session; error?: never } | { session?: never; error: NextResponse };
export async function requireRole(roles: readonly Role[]): Promise<GuardResult> {
  let session: Session | null;
  try { session = await getSession(); } catch { return { error: NextResponse.json({ ok: false, error: "Authentication unavailable" }, { status: 503 }) }; }
  if (!session) return { error: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }) };
  if (!roles.includes(session.role)) return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function requireOwnTeam(teamId: string): Promise<GuardResult> {
  const result = await requireRole(["admin", "team_manager"]);
  if (result.error) return result;
  if (result.session.role === "team_manager" && result.session.team_id !== teamId) {
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
