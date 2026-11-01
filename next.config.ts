import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
