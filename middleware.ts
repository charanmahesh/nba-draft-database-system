import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/auth/login" || pathname === "/api/health") return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && await verifySession(token)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/players/:path*", "/prospects/:path*", "/teams/:path*", "/rosters/:path*", "/games/:path*", "/reports/:path*", "/news/:path*", "/search/:path*", "/draft-board/:path*", "/team-match-board/:path*"],
};
