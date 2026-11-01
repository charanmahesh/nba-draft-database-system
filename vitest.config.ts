import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include:["tests/**/*.test.ts"], globalSetup:["./tests/support/global-setup.ts"], fileParallelism:false, testTimeout:180000, hookTimeout:300000 } });
