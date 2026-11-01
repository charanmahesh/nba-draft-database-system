import { EMBEDDING_MODEL } from "./config";
import { embedText } from "./embed";
import { toSql } from "pgvector/pg";
import type { Client, PoolClient } from "pg";

export interface GeneratedReport {
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

export interface ArchetypeResult {
  archetype: string;
  query: string;
  expectedCount: number;
  retrievedCount: number;
  relevantCount: number;
  precisionAtFive: number;
}

// Alternate phrasings are separate from the standard query set.
const PARAPHRASED_QUERIES: Record<string, string> = {
  rim_protector: "erases shots at the rim",
  sharpshooter: "deadeye shooter from downtown",
  playmaking_guard: "floor general who creates chances for teammates",
  two_way_wing: "versatile wing who scores and defends",
  slasher: "attacker who drives to the hoop",
  stretch_big: "center who spaces the floor from deep",
  defensive_stopper: "lockdown defender who disrupts opponents",
  raw_athlete: "explosive athlete with physical upside",
};

export const TOP_K = 5;
const HNSW_EF_SEARCH = 100;
export const MINIMUM_PRECISION_AT_FIVE = 0.6;

export function parseReportsFile(jsonText: string): GeneratedReportsFile {
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

export async function runEvaluation(client: PoolClient | Client, reportFile: GeneratedReportsFile, paraphrased: boolean): Promise<ArchetypeResult[]> {
  const reportsPath = "provided report fixture";
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

    const query = paraphrased ? PARAPHRASED_QUERIES[archetype] : reports[0].query;
    if (!query) throw new Error(`Missing paraphrased query for ${archetype}`);
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

