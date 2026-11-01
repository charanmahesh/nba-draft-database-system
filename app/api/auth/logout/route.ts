import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { getSession } from "@/lib/auth/guard";
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const response = NextResponse.json({ ok: true, data: null });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
