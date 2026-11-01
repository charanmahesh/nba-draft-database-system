import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../lib/db/pg";
import { parseReportsFile, runEvaluation, TOP_K, MINIMUM_PRECISION_AT_FIVE } from "../lib/embeddings/retrieval-eval";

async function main(): Promise<void> {
  const requiredVariables = [
    "PG_HOST",
    "PG_PORT",
    "PG_USER",
    "PG_PASSWORD",
    "PG_DATABASE",
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing PostgreSQL environment variables: ${missingVariables.join(", ")}`,
    );
  }

  const client = await pool.connect();
  try {
    const reportFile = parseReportsFile(await readFile(process.argv[2] ? resolve(process.argv[2]) : resolve(process.cwd(), "db", "seed", "reports.json"), "utf8"));
    let allSetsPassed = true;
    for (const paraphrased of [false, true]) {
      const results = await runEvaluation(client, reportFile, paraphrased);
      console.log(`Retrieval evaluation (${paraphrased ? "paraphrased" : "standard"}; top five nearest reports):`);
      for (const result of results) {
        const passed = result.precisionAtFive >= MINIMUM_PRECISION_AT_FIVE;
        console.log(
          `${passed ? "PASS" : "FAIL"} ${result.archetype}: ${result.relevantCount}/${TOP_K} relevant (${(result.precisionAtFive * 100).toFixed(0)}%) — ${result.query}`,
        );
      }

      const macroPrecision =
        results.reduce((sum, result) => sum + result.precisionAtFive, 0) /
        results.length;
      const allPassed = results.every(
        (result) => result.precisionAtFive >= MINIMUM_PRECISION_AT_FIVE,
      );
      console.log(
        `Macro precision@${TOP_K}: ${(macroPrecision * 100).toFixed(1)}%; required per archetype: ${(MINIMUM_PRECISION_AT_FIVE * 100).toFixed(0)}%.`,
      );

      allSetsPassed &&= allPassed;
    }
    if (!allSetsPassed) {
      throw new Error(
        "Retrieval evaluation failed: each archetype must have a majority of matching labels in its top five results.",
      );
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error("Retrieval evaluation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
