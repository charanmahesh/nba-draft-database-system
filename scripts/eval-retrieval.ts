import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EMBEDDING_MODEL } from "../lib/embeddings/config";
import { embedText } from "../lib/embeddings/embed";
import { pool } from "../lib/db/pg";
import { toSql } from "pgvector/pg";
import type { PoolClient } from "pg";

interface GeneratedReport {
  report_id: string;
  archetype: string;
  query: string;
}

interface GeneratedReportsFile {
  reports: GeneratedReport[];
}

interface RetrievedReport {
  report_id: string;
}

interface ArchetypeResult {
  archetype: string;
  query: string;
  expectedCount: number;
  retrievedCount: number;
  relevantCount: number;
  precisionAtFive: number;
}

const TOP_K = 5;
const HNSW_EF_SEARCH = 100;
const MINIMUM_PRECISION_AT_FIVE = 0.6;
const DEFAULT_REPORTS_PATH = resolve(process.cwd(), "db", "seed", "reports.json");

function parseReportsFile(jsonText: string): GeneratedReportsFile {
  const parsed: unknown = JSON.parse(jsonText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("reports" in parsed) ||
    !Array.isArray(parsed.reports)
  ) {
    throw new Error("Generated reports JSON must contain a reports array.");
  }

  const reports = parsed.reports as unknown[];
  if (
    reports.some(
      (report) =>
        typeof report !== "object" ||
        report === null ||
        !("report_id" in report) ||
        typeof report.report_id !== "string" ||
        !("archetype" in report) ||
        typeof report.archetype !== "string" ||
        !("query" in report) ||
        typeof report.query !== "string" ||
        report.query.trim().length === 0,
    )
  ) {
    throw new Error(
      "Each generated report must include string report_id, archetype, and query fields.",
    );
  }

  return { reports: reports as GeneratedReport[] };
}

async function runEvaluation(client: PoolClient): Promise<ArchetypeResult[]> {
  const reportsPath = process.argv[2]
    ? resolve(process.argv[2])
    : DEFAULT_REPORTS_PATH;
  const reportFile = parseReportsFile(await readFile(reportsPath, "utf8"));
  const reportsByArchetype = new Map<string, GeneratedReport[]>();
  const allReportIds: string[] = [];

  for (const report of reportFile.reports) {
    allReportIds.push(report.report_id);
    const group = reportsByArchetype.get(report.archetype) ?? [];
    group.push(report);
    reportsByArchetype.set(report.archetype, group);
  }

  if (reportsByArchetype.size === 0 || allReportIds.length < TOP_K) {
    throw new Error(`No generated report labels found in ${reportsPath}.`);
  }
  if (new Set(allReportIds).size !== allReportIds.length) {
    throw new Error("Generated reports JSON contains duplicate report IDs.");
  }

  await client.query("SELECT set_config('hnsw.ef_search', $1, false)", [
    String(HNSW_EF_SEARCH),
  ]);

  const results: ArchetypeResult[] = [];
  for (const [archetype, reports] of reportsByArchetype) {
    const queries = new Set(reports.map((report) => report.query));
    if (queries.size !== 1) {
      throw new Error(
        `Archetype "${archetype}" must map to exactly one retrieval query.`,
      );
    }

    const query = reports[0].query;
    const queryEmbedding = await embedText(query);
    const retrieved = await client.query<RetrievedReport>(
      `SELECT report_id::text
       FROM scouting_report
       WHERE embedding IS NOT NULL
         AND embedding_model = $2
         AND report_id = ANY($3::bigint[])
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [toSql(queryEmbedding), EMBEDDING_MODEL, allReportIds, TOP_K],
    );
    if (retrieved.rows.length !== TOP_K) {
      throw new Error(
        `Archetype "${archetype}" expected ${TOP_K} embedded generated reports, found ${retrieved.rows.length}. Run the embedding backfill and verify reports.json matches the database.`,
      );
    }

    const expectedIds = new Set(reports.map((report) => report.report_id));
    const relevantCount = retrieved.rows.filter((row) =>
      expectedIds.has(row.report_id),
    ).length;
    results.push({
      archetype,
      query,
      expectedCount: reports.length,
      retrievedCount: retrieved.rows.length,
      relevantCount,
      precisionAtFive: relevantCount / TOP_K,
    });
  }

  return results;
}

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
    const results = await runEvaluation(client);
    console.log("Retrieval evaluation (top five nearest reports per archetype):");
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

    if (!allPassed) {
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
