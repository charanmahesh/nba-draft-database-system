import { pipeline } from "@xenova/transformers";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./config";

type FeatureExtractor = (text: string, options: { pooling: "mean"; normalize: true }) => Promise<{
  data: Float32Array;
}>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

function getExtractor(): Promise<FeatureExtractor> {
  extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL) as unknown as Promise<FeatureExtractor>;
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const output = await (await getExtractor())(text, { pooling: "mean", normalize: true });
  const embedding = Array.from(output.data);
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${embedding.length}`);
  }
  return embedding;
}
