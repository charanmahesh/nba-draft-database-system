import "dotenv/config";
import { EMBEDDING_MODEL } from "../lib/embeddings/config";
import { embedText } from "../lib/embeddings/embed";
import { pool } from "../lib/db/pg";
import { toSql } from "pgvector/pg";

interface PendingReport {
  report_id: string;
  summary: string;
}

interface PendingArticle {
  article_id: string;
  title: string;
  summary: string;
}

const DEFAULT_BATCH_SIZE = 16;

function parseBatchSize(args: string[]): number {
  let batchSize = DEFAULT_BATCH_SIZE;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--missing") continue;
    if (args[index] === "--batch-size") {
      const parsedBatchSize = Number(args[index + 1]);
      if (
        !Number.isInteger(parsedBatchSize) ||
        parsedBatchSize < 1 ||
        parsedBatchSize > 500
      ) {
        throw new Error("--batch-size must be an integer between 1 and 500.");
      }
      batchSize = parsedBatchSize;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${args[index]}`);
  }
  return batchSize;
}

async function embedReports(batchSize: number): Promise<number> {
  let processed = 0;

  while (true) {
    const pending = await pool.query<PendingReport>(
      `SELECT report_id::text, summary
       FROM scouting_report
       WHERE embedding IS NULL
       ORDER BY report_id
       LIMIT $1`,
      [batchSize],
    );
    if (pending.rows.length === 0) return processed;

    for (const report of pending.rows) {
      const embedding = await embedText(report.summary);
      const updated = await pool.query(
        `UPDATE scouting_report
         SET embedding = $2::vector,
             embedding_model = $3,
             embedded_at = now()
         WHERE report_id = $1
           AND embedding IS NULL
           AND summary = $4`,
        [
          report.report_id,
          toSql(embedding),
          EMBEDDING_MODEL,
          report.summary,
        ],
      );
      processed += updated.rowCount ?? 0;
    }

    console.log(`Embedded ${processed} scouting reports.`);
  }
}

async function embedArticles(batchSize: number): Promise<number> {
  let processed = 0;

  while (true) {
    const pending = await pool.query<PendingArticle>(
      `SELECT article_id::text, title, summary
       FROM news_article
       WHERE embedding IS NULL
       ORDER BY article_id
       LIMIT $1`,
      [batchSize],
    );
    if (pending.rows.length === 0) return processed;

    for (const article of pending.rows) {
      const sourceText = `${article.title}. ${article.summary}`;
      const embedding = await embedText(sourceText);
      const updated = await pool.query(
        `UPDATE news_article
         SET embedding = $2::vector,
             embedding_model = $3,
             embedded_at = now()
         WHERE article_id = $1
           AND embedding IS NULL
           AND title = $4
           AND summary = $5`,
        [
          article.article_id,
          toSql(embedding),
          EMBEDDING_MODEL,
          article.title,
          article.summary,
        ],
      );
      processed += updated.rowCount ?? 0;
    }

    console.log(`Embedded ${processed} news articles.`);
  }
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

  const batchSize = parseBatchSize(process.argv.slice(2));
  const reportCount = await embedReports(batchSize);
  const articleCount = await embedArticles(batchSize);
  console.log(
    `Backfill complete: ${reportCount} reports and ${articleCount} articles embedded with ${EMBEDDING_MODEL}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Embedding backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
