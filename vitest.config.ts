import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include:["tests/**/*.test.ts"], globalSetup:["./tests/support/global-setup.ts"], fileParallelism:false, testTimeout:15000, hookTimeout:30000 } });
