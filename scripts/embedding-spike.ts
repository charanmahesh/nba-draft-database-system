import "dotenv/config";
import { embedText } from "../lib/embeddings/embed";

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

async function main(): Promise<void> {
  const first = await embedText("A versatile guard creates open shots for teammates.");
  const second = await embedText("A playmaking ball handler generates scoring opportunities.");
  console.log(`first dimension: ${first.length}`);
  console.log(`second dimension: ${second.length}`);
  console.log(`cosine similarity: ${cosineSimilarity(first, second).toFixed(6)}`);
}

main().catch((error: unknown) => {
  console.error("Embedding spike failed:", error);
  process.exitCode = 1;
});
