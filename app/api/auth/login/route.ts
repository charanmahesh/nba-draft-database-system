import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { pool } from "@/lib/db/pg";
import { loginSchema } from "@/lib/validators/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth/jwt";
import type { Session } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const input = loginSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid login input" }, { status: 400 });
  try {
  const result = await pool.query<Session & { password_hash: string }>(
    `SELECT p.person_id::text, concat_ws(' ', p.f_name, p.l_name) AS name,
            p.email, p.role::text AS role, tm.team_id::text, p.password_hash
       FROM person p LEFT JOIN team_manager tm ON tm.person_id = p.person_id
      WHERE p.email = $1`,
    [input.data.email],
  );
  const person = result.rows[0];
  if (!person || !(await compare(input.data.password, person.password_hash))) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }
  const { password_hash: _passwordHash, ...session } = person;
  const response = NextResponse.json({ ok: true, data: session });
  response.cookies.set(SESSION_COOKIE, await signSession(person.person_id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return response;
  } catch { return NextResponse.json({ ok: false, error: "Authentication unavailable" }, { status: 503 }); }
}
