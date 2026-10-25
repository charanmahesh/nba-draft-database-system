import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pg";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await pool.query<{ database: string; vector_enabled: boolean }>(
      `SELECT current_database() AS database,
              EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_enabled`,
    );
    const data = result.rows[0];
    const healthy = Boolean(data?.vector_enabled);
    return NextResponse.json(
      { ok: healthy, data: { database: data?.database, vectorEnabled: data?.vector_enabled } },
      { status: healthy ? 200 : 503 },
    );
  } catch (error: unknown) {
    console.error("Health check failed:", error);
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }
}
