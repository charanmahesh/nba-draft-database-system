import { NextResponse } from "next/server";
import { embedText } from "@/lib/embeddings/embed";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/embeddings/config";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const embedding = await embedText("A prospect with strong two-way potential.");
    return NextResponse.json({
      ok: true,
      data: { model: EMBEDDING_MODEL, dimensions: embedding.length, expectedDimensions: EMBEDDING_DIMENSIONS },
    });
  } catch (error: unknown) {
    console.error("Embedding route failed:", error);
    return NextResponse.json({ ok: false, error: "Embedding model unavailable" }, { status: 503 });
  }
}
