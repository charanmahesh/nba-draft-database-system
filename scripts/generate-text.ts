import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../lib/db/pg";

type Position = "PG" | "SG" | "SF" | "PF" | "C" | null;

interface PlayerProfile {
  player_id: string;
  f_name: string;
  l_name: string;
  position: Position;
  games_played: number;
  avg_minutes: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_blocks: number;
  avg_steals: number;
  production_per_minute: number;
  height_cm: number | null;
  weight_kg: number | null;
  wingspan_cm: number | null;
  vertical_leap_cm: number | null;
}

interface Archetype {
  key: string;
  query: string;
  score: (player: PlayerProfile) => number;
  observations: (player: PlayerProfile) => string[];
}

interface GeneratedReport {
  report_id: string;
  player_id: string;
  archetype: string;
  query: string;
  summary: string;
}

interface GeneratedArticle {
  article_id: string;
  title: string;
  publish_date: string;
  summary: string;
  mentioned_player_ids: string[];
}

const REPORT_MARKER =
  "Generated demo scouting text (synthetic; not a real scouting report).";
const ARTICLE_MARKER =
  "Generated demo article (synthetic; not real news material).";
const REPORTS_PER_ARCHETYPE = 15;
const ARTICLES_TO_GENERATE = 60;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const archetypes: Archetype[] = [
  {
    key: "rim_protector",
    query: "athletic rim protector who blocks shots",
    score: (player) =>
      player.avg_blocks * 10 +
      (player.position === "C" || player.position === "PF" ? 4 : 0) +
      (player.height_cm ?? 0) / 100,
    observations: (player) => [
      `An athletic rim protector who blocks shots: the box-score sample records ${format(player.avg_blocks)} blocks per game, with ${player.position ?? "an unlisted"} position and ${measurement(player.height_cm, "cm", "listed height")}.`,
      `An athletic paint protector contests shots; ${format(player.avg_blocks)} blocks per appearance provide the clearest recorded indicator of paint-side defensive activity in this sample.`,
      `A rim protector who blocks shots: the selected games show ${format(player.avg_blocks)} blocks per game; the position listing is ${player.position ?? "not available"}.`,
    ],
  },
  {
    key: "high_volume_scorer",
    query: "high scoring player who creates offense",
    score: (player) =>
      player.avg_points + (player.position === "SG" || player.position === "SF" ? 1 : 0),
    observations: (player) => [
      `A high scoring offensive creator: scoring volume stands out at ${format(player.avg_points)} points per game, without making a claim about shooting efficiency.`,
      `This high scoring player creates offense; the imported box scores show ${format(player.avg_points)} points per appearance across ${player.games_played} games.`,
      `A high scoring player who creates offense: among the recorded per-game figures, ${format(player.avg_points)} points is the most prominent offensive output.`,
    ],
  },
  {
    key: "playmaking_guard",
    query: "playmaking guard who creates chances for teammates",
    score: (player) =>
      player.avg_assists * 2 +
      (player.position === "PG" || player.position === "SG" ? 3 : 0),
    observations: (player) => [
      `A playmaking guard creates chances for teammates; ${format(player.avg_assists)} assists per game provide a box-score view of passing and play creation.`,
      `The playmaking guard creates opportunities for teammates; NBA appearances record ${format(player.avg_assists)} assists per game alongside ${format(player.avg_points)} points.`,
      `A guard whose playmaking creates chances for teammates: at ${format(player.avg_assists)} assists per appearance, the passing line is a notable part of this statistical profile.`,
    ],
  },
  {
    key: "two_way_wing",
    query: "two way wing who contributes scoring and defense",
    score: (player) =>
      player.avg_points * 0.3 +
      player.avg_steals * 3 +
      (player.position === "SG" || player.position === "SF" ? 4 : 0),
    observations: (player) => [
      `A two-way wing contributes scoring and defense; the recorded line combines ${format(player.avg_points)} points and ${format(player.avg_steals)} steals per game.`,
      `This two-way wing combines offense and defensive activity: ${format(player.avg_points)} points and ${format(player.avg_steals)} steals describe the available scoring and disruption outputs.`,
      `A wing with scoring and defense: the position listing is ${player.position ?? "not available"}; the box scores show ${format(player.avg_points)} points and ${format(player.avg_steals)} steals per appearance.`,
    ],
  },
  {
    key: "rebounding_big",
    query: "frontcourt player who controls the rebounds",
    score: (player) =>
      player.avg_rebounds * 2 +
      (player.position === "C" || player.position === "PF" ? 4 : 0),
    observations: (player) => [
      `A frontcourt player who controls the rebounds: ${format(player.avg_rebounds)} rebounds per game are the leading figure in this profile.`,
      `A rebounding frontcourt player controls the glass; box scores record ${format(player.avg_rebounds)} rebounds and ${format(player.avg_points)} points per appearance.`,
      `A frontcourt rebounder controls the boards; rebounding volume is ${format(player.avg_rebounds)} per game over ${player.games_played} selected-subset appearances.`,
    ],
  },
  {
    key: "defensive_disruptor",
    query: "defensive player with steals and blocks",
    score: (player) => player.avg_steals * 2 + player.avg_blocks * 3,
    observations: (player) => [
      `A defensive disruptor records steals and blocks: the box-score sample records ${format(player.avg_steals)} steals and ${format(player.avg_blocks)} blocks per game.`,
      `This defensive player contributes steals and blocks; they total ${format(player.avg_steals + player.avg_blocks)} per appearance in the available defensive counting stats.`,
      `Defensive disruption through steals and blocks: the recorded line includes ${format(player.avg_steals)} steals, ${format(player.avg_blocks)} blocks, and ${format(player.avg_rebounds)} rebounds per game.`,
    ],
  },
  {
    key: "per_minute_contributor",
    query: "productive player who contributes across the box score",
    score: (player) => player.production_per_minute * 100,
    observations: (player) => [
      `The recorded points, rebounds, assists, steals, and blocks sum to ${format(player.production_per_minute)} per minute.`,
      `Across ${format(player.avg_minutes)} minutes per appearance, the selected box-score categories produce ${format(player.production_per_minute)} combined contributions per minute.`,
      `This profile uses only points, rebounds, assists, steals, and blocks; their combined rate is ${format(player.production_per_minute)} per minute.`,
    ],
  },
  {
    key: "measured_profile",
    query: "player physical profile with verified combine measurements",
    score: (player) =>
      (player.vertical_leap_cm ?? 0) +
      (player.wingspan_cm ?? 0) / 10 +
      (player.height_cm ?? 0) / 10,
    observations: (player) => [
      `The available player record lists ${measurement(player.height_cm, "cm", "height")}, ${measurement(player.weight_kg, "kg", "weight")}, and ${measurement(player.wingspan_cm, "cm", "wingspan")}.`,
      `Safely matched combine data lists ${measurement(player.vertical_leap_cm, "cm", "vertical leap")} and ${measurement(player.wingspan_cm, "cm", "wingspan")}; missing measurements are not estimated.`,
      `The physical details available for this player are ${measurement(player.height_cm, "cm", "height")} and ${measurement(player.weight_kg, "kg", "weight")}.`,
    ],
  },
];

function format(value: number): string {
  return value.toFixed(1);
}

function measurement(value: number | null, unit: string, label: string): string {
  return value === null ? `no safely matched ${label} recorded` : `${format(value)} ${unit}`;
}

function playerName(player: PlayerProfile): string {
  return `${player.f_name} ${player.l_name}`.trim();
}

function buildReport(
  player: PlayerProfile,
  archetype: Archetype,
  reportNumber: number,
): string {
  const name = playerName(player);
  const observations = archetype.observations(player);
  const openings = [
    `Across ${player.games_played} imported NBA appearances, ${name} averaged ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists.`,
    `The selected box-score sample covers ${player.games_played} games for ${name}: ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists per appearance.`,
    `${name}'s imported NBA line is based on ${player.games_played} appearances and includes ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists per game.`,
    `In ${player.games_played} selected-subset appearances, ${name} recorded per-game averages of ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists.`,
    `The real box-score inputs for ${name} show ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists over ${player.games_played} appearances.`,
  ];
  const measurementNotes = [
    `Combine context: ${measurement(player.height_cm, "cm", "height")}; ${measurement(player.weight_kg, "kg", "weight")}; ${measurement(player.wingspan_cm, "cm", "wingspan")}.`,
    `Where a safe combine match exists, the recorded vertical leap is ${measurement(player.vertical_leap_cm, "cm", "vertical leap")}; no missing value is inferred.`,
    `Physical measurements are source-backed only: height ${measurement(player.height_cm, "cm", "height")}, weight ${measurement(player.weight_kg, "kg", "weight")}.`,
    `Combine measurements are optional and safely matched; this row has ${measurement(player.wingspan_cm, "cm", "wingspan")} and ${measurement(player.vertical_leap_cm, "cm", "vertical leap")}.`,
  ];

  return `${REPORT_MARKER} ${openings[reportNumber % openings.length]} ${observations[reportNumber % observations.length]} ${measurementNotes[reportNumber % measurementNotes.length]}`;
}

function buildArticle(player: PlayerProfile, articleNumber: number): {
  title: string;
  summary: string;
} {
  const name = playerName(player);
  const titleOptions = [
    `${name}: selected-season box-score snapshot`,
    `A statistical look at ${name}'s NBA appearances`,
    `${name} in the imported NBA sample`,
    `Numbers note: ${name}'s recorded production`,
    `DraftBoard demo profile: ${name}`,
  ];
  const statOptions = [
    `In ${player.games_played} imported NBA appearances, ${name} averaged ${format(player.avg_points)} points, ${format(player.avg_rebounds)} rebounds, and ${format(player.avg_assists)} assists.`,
    `The selected box scores list ${format(player.avg_steals)} steals and ${format(player.avg_blocks)} blocks per game for ${name}, alongside ${format(player.avg_points)} points.`,
    `${name}'s recorded rate across points, rebounds, assists, steals, and blocks is ${format(player.production_per_minute)} combined contributions per minute.`,
    `The player record lists ${measurement(player.height_cm, "cm", "height")} and ${measurement(player.weight_kg, "kg", "weight")}; these physical values are present only when safely matched.`,
    `Across ${format(player.avg_minutes)} minutes per appearance, the imported sample records ${format(player.avg_points)} points and ${format(player.avg_rebounds)} rebounds for ${name}.`,
  ];

  return {
    title: `[Generated demo article] ${titleOptions[articleNumber % titleOptions.length]}`,
    summary: `${ARTICLE_MARKER} ${statOptions[articleNumber % statOptions.length]} This synthetic item summarizes imported statistics only; it does not report a real event, quote, transaction, or injury.`,
  };
}

async function loadProfiles(): Promise<PlayerProfile[]> {
  const result = await pool.query<PlayerProfile>(`
    SELECT
      p.player_id::text,
      p.f_name,
      p.l_name,
      p.position::text AS position,
      COUNT(gp.performance_id)::integer AS games_played,
      COALESCE(AVG(gp.minutes), 0)::double precision AS avg_minutes,
      COALESCE(AVG(gp.points), 0)::double precision AS avg_points,
      COALESCE(AVG(gp.rebounds), 0)::double precision AS avg_rebounds,
      COALESCE(AVG(gp.assists), 0)::double precision AS avg_assists,
      COALESCE(AVG(gp.blocks), 0)::double precision AS avg_blocks,
      COALESCE(AVG(gp.steals), 0)::double precision AS avg_steals,
      COALESCE(
        SUM(gp.points + gp.rebounds + gp.assists + gp.steals + gp.blocks)
          / NULLIF(SUM(gp.minutes), 0),
        0
      )::double precision AS production_per_minute,
      p.height_cm::double precision,
      p.weight_kg::double precision,
      measurements.wingspan_cm,
      measurements.vertical_leap_cm
    FROM player p
    JOIN game_performance gp ON gp.player_id = p.player_id
    JOIN game g ON g.game_id = gp.game_id AND g.external_id LIKE 'nba:%'
    LEFT JOIN LATERAL (
      SELECT
        (MAX(cm.value) FILTER (WHERE cm.measurement_type = 'wingspan_cm'))::double precision AS wingspan_cm,
        (MAX(cm.value) FILTER (WHERE cm.measurement_type = 'vertical_leap_cm'))::double precision AS vertical_leap_cm
      FROM combined_measurement cm
      WHERE cm.player_id = p.player_id
    ) measurements ON true
    GROUP BY
      p.player_id, p.f_name, p.l_name, p.position, p.height_cm, p.weight_kg,
      measurements.wingspan_cm, measurements.vertical_leap_cm
    HAVING COUNT(gp.performance_id) > 0
    ORDER BY p.player_id
  `);

  return result.rows;
}

async function insertGeneratedRows(
  reports: Array<Omit<GeneratedReport, "report_id">>,
  articles: Array<Omit<GeneratedArticle, "article_id" | "publish_date">>,
  scoutId: string,
): Promise<{ reports: GeneratedReport[]; articles: GeneratedArticle[] }> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "DELETE FROM scouting_report WHERE scout_id = $1 AND summary LIKE $2",
      [scoutId, `${REPORT_MARKER}%`],
    );
    await client.query("DELETE FROM news_article WHERE summary LIKE $1", [
      `${ARTICLE_MARKER}%`,
    ]);

    const savedReports: GeneratedReport[] = [];
    for (const report of reports) {
      const result = await client.query<{ report_id: string }>(
        `INSERT INTO scouting_report (player_id, scout_id, summary)
         VALUES ($1, $2, $3)
         RETURNING report_id::text`,
        [report.player_id, scoutId, report.summary],
      );
      savedReports.push({ ...report, report_id: result.rows[0].report_id });
    }

    const savedArticles: GeneratedArticle[] = [];
    for (const article of articles) {
      const result = await client.query<{
        article_id: string;
        publish_date: string;
      }>(
        `INSERT INTO news_article (title, publish_date, summary, url)
         VALUES ($1, CURRENT_DATE, $2, NULL)
         RETURNING article_id::text, publish_date::text`,
        [article.title, article.summary],
      );
      const articleId = result.rows[0].article_id;
      for (const playerId of article.mentioned_player_ids) {
        await client.query(
          `INSERT INTO article_mention (article_id, player_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [articleId, playerId],
        );
      }
      savedArticles.push({
        ...article,
        article_id: articleId,
        publish_date: result.rows[0].publish_date,
      });
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return { reports: savedReports, articles: savedArticles };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Could not roll back generated text transaction:", rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const requiredDatabaseVariables = [
    "PG_HOST",
    "PG_PORT",
    "PG_USER",
    "PG_PASSWORD",
    "PG_DATABASE",
  ];
  const missingVariables = requiredDatabaseVariables.filter(
    (name) => !process.env[name],
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing PostgreSQL environment variables: ${missingVariables.join(", ")}. Configure them in .env before running text generation.`,
    );
  }

  const players = await loadProfiles();
  if (players.length === 0) {
    throw new Error(
      "No imported NBA box-score profiles found. Run the Phase 3A import before generating supporting text.",
    );
  }

  const scoutResult = await pool.query<{ person_id: string }>(
    `SELECT s.person_id::text
     FROM scout s
     JOIN person p ON p.person_id = s.person_id
     WHERE p.email = $1 AND p.role = 'scout'`,
    ["scout@draftboard.local"],
  );
  if (scoutResult.rowCount !== 1) {
    throw new Error(
      "Seeded scout not found. Run db/postgres/06_seed.sql before generating text.",
    );
  }

  const reportInputs: Array<Omit<GeneratedReport, "report_id">> = [];
  const archetypeProfiles = archetypes.map((archetype) => ({
    archetype,
    players: [...players]
      .sort((left, right) => {
        const scoreDifference = archetype.score(right) - archetype.score(left);
        return scoreDifference || left.player_id.localeCompare(right.player_id);
      })
      .slice(0, Math.min(30, players.length)),
  }));

  for (const { archetype, players: rankedPlayers } of archetypeProfiles) {
    for (let index = 0; index < REPORTS_PER_ARCHETYPE; index += 1) {
      const player = rankedPlayers[index % rankedPlayers.length];
      reportInputs.push({
        player_id: player.player_id,
        archetype: archetype.key,
        query: archetype.query,
        summary: buildReport(player, archetype, index),
      });
    }
  }

  const articleInputs: Array<Omit<GeneratedArticle, "article_id" | "publish_date">> = [];
  for (let index = 0; index < ARTICLES_TO_GENERATE; index += 1) {
    const player = players[index % players.length];
    const article = buildArticle(player, index);
    articleInputs.push({
      ...article,
      mentioned_player_ids: [player.player_id],
    });
  }

  if (reportInputs.length < 120 || articleInputs.length < 60) {
    throw new Error(
      `Generated text minimums not met: ${reportInputs.length} reports and ${articleInputs.length} articles.`,
    );
  }

  const saved = await insertGeneratedRows(
    reportInputs,
    articleInputs,
    scoutResult.rows[0].person_id,
  );
  const outputDirectory = resolve(ROOT, "db", "seed");
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all([
    writeFile(
      resolve(outputDirectory, "reports.json"),
      `${JSON.stringify(
        { generatedAt: new Date().toISOString(), reports: saved.reports },
        null,
        2,
      )}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "articles.json"),
      `${JSON.stringify(
        { generatedAt: new Date().toISOString(), articles: saved.articles },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);

  console.log(
    `Generated ${saved.reports.length} reports across ${archetypes.length} archetypes and ${saved.articles.length} articles.`,
  );
  console.log("Spot-check (first 20 report summaries):");
  for (const report of saved.reports.slice(0, 20)) {
    console.log(`- ${report.summary}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Phase 3B text generation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
