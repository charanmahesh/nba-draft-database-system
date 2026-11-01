import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guard";
export async function GET() {
  const session = await getSession();
  return session ? NextResponse.json({ ok: true, data: session }) : NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
}
