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
  three_made: number;
  three_attempts: number;
  three_pct: number;
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
  { key: "rim_protector", query: "interior defender who contests attempts near the basket", score: p => p.avg_blocks * 10 + (p.position === "C" || p.position === "PF" ? 4 : 0), observations: p => [
    `Paint anchor who challenges close-range attempts and protects the basket: ${format(p.avg_blocks)} rejections per game suggest activity around the basket.`,
    `Defensive big who contests layups and protects the basket: ${format(p.avg_blocks)} blocks per appearance offer a proxy for deterring drives.`,
    `Paint defense against shots near the basket is suggested by ${format(p.avg_blocks)} swats per outing; positioning requires film review.`,
  ] },
  { key: "sharpshooter", query: "perimeter shooting specialist with long range accuracy", score: p => p.three_attempts >= 2 ? p.three_made * 4 + p.three_pct * 5 : -1, observations: p => [
    `Accurate outside marksman and distance shooter: ${format(p.three_made)} triples made on ${format(p.three_attempts)} attempts per game.`,
    `Accurate outside shooting supplies floor spacing beyond the arc, with ${(p.three_pct * 100).toFixed(1)}% on recorded three-point attempts.`,
    `The accurate long-distance shooting profile includes ${format(p.three_made)} makes per outing; shot difficulty is not in this sample.`,
  ] },
  { key: "playmaking_guard", query: "backcourt creator who sets up teammates", score: p => p.avg_assists * 2 + (p.position === "PG" || p.position === "SG" ? 3 : 0), observations: p => [
    `A backcourt floor leader orchestrating opportunities for others: ${format(p.avg_assists)} assists per game point to passing involvement.`,
    `Backcourt floor leadership and distribution: a passing facilitator with ${format(p.avg_assists)} assists per appearance; decision quality needs video review.`,
    `A backcourt orchestrator creating opportunities for others: distribution stands out in the box score at ${format(p.avg_assists)} assists an outing.`,
  ] },
  { key: "two_way_wing", query: "versatile wing contributing on offense and defense", score: p => p.avg_points * .3 + p.avg_steals * 3 + (p.position === "SG" || p.position === "SF" ? 4 : 0), observations: p => [
    `A wing with scoring and defensive contributions at both ends: ${format(p.avg_points)} points and ${format(p.avg_steals)} steals per game.`,
    `A wing active on offense and defense: this scoring and disruption profile combines ${format(p.avg_points)} points with ${format(p.avg_steals)} takeaways per outing.`,
    `A wing scoring and defending: the box-score blend of ${format(p.avg_points)} points and ${format(p.avg_steals)} steals merits a closer look at both ends.`,
  ] },
  { key: "slasher", query: "attacker who drives to the basket", score: p => p.avg_points * 0.7 + (p.position === "SG" || p.position === "SF" ? 2 : 0), observations: p => [
    `An attacking scorer driving toward the basket: ${format(p.avg_points)} points per game indicate scoring volume, not a verified shot diet.`,
    `An attacking threat driving toward the basket based on ${format(p.avg_points)} points per appearance; drives need film confirmation.`,
    `Attacking the basket is a hypothesis for this ${format(p.avg_points)}-point scorer, not a tracked statistic.`,
  ] },
  { key: "stretch_big", query: "frontcourt player who spaces the floor from deep", score: p => (p.position === "C" || p.position === "PF") && p.three_attempts >= 1 ? 10 + p.three_made * 4 + p.three_pct * 4 : -1, observations: p => [
    `A frontcourt center or forward with outside range and floor spacing: ${format(p.three_made)} triples on ${format(p.three_attempts)} attempts per game.`,
    `A frontcourt center or forward spacing the floor with perimeter range, converting ${(p.three_pct * 100).toFixed(1)}% of recorded attempts from beyond the arc.`,
    `A frontcourt floor-spacer offering a long-distance shooting indicator: ${format(p.three_made)} makes per outing.`,
  ] },
  { key: "defensive_stopper", query: "perimeter defender who disrupts opposing scorers", score: p => p.avg_steals * 4 + (p.position === "PG" || p.position === "SG" || p.position === "SF" ? 3 : 0), observations: p => [
    `A perimeter stopper applying defensive pressure: ${format(p.avg_steals)} steals per game track only one part of on-ball resistance.`,
    `A potential defensive stopper and point-of-attack pest, with ${format(p.avg_steals)} takeaways per appearance; coverage requires film.`,
    `A perimeter stopper whose passing-lane disruption appears in ${format(p.avg_steals)} steals an outing, not a complete measure of guarding.`,
  ] },
  { key: "raw_athlete", query: "explosive athlete with physical upside", score: p => p.vertical_leap_cm === null ? -1 : p.vertical_leap_cm + (p.wingspan_cm ?? 0) * .1, observations: p => [
    `Developmental physical tools: a verified ${format(p.vertical_leap_cm ?? 0)} cm vertical and ${measurement(p.wingspan_cm, "cm", "wingspan")}.`,
    `A physical-upside candidate on combine testing alone: ${format(p.vertical_leap_cm ?? 0)} cm leap; basketball skills need separate review.`,
    `Measured burst and length offer a starting point: ${format(p.vertical_leap_cm ?? 0)} cm vertical, ${measurement(p.wingspan_cm, "cm", "wingspan")}.`,
  ] },
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


  return `${REPORT_MARKER} ${observations[reportNumber % observations.length]} ${observations[(reportNumber + 1) % observations.length]} ${openings[reportNumber % openings.length]}`;
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
    WITH shooting AS (
      SELECT trim(d.player_id) AS source_player_id,
             SUM(CASE WHEN d.fg3m ~ '^[0-9]+([.][0-9]+)?$' THEN d.fg3m::numeric ELSE 0 END) AS made,
             SUM(CASE WHEN d.fg3a ~ '^[0-9]+([.][0-9]+)?$' THEN d.fg3a::numeric ELSE 0 END) AS attempts,
             COUNT(*)::numeric AS games
      FROM stg_nba_game_detail d
      JOIN game source_game ON source_game.external_id = 'nba:' || trim(d.game_id)
      GROUP BY trim(d.player_id)
    )
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
      measurements.vertical_leap_cm,
      COALESCE(shooting.made / NULLIF(shooting.games, 0), 0)::double precision AS three_made,
      COALESCE(shooting.attempts / NULLIF(shooting.games, 0), 0)::double precision AS three_attempts,
      COALESCE(shooting.made / NULLIF(shooting.attempts, 0), 0)::double precision AS three_pct
    FROM player p
    JOIN game_performance gp ON gp.player_id = p.player_id
    JOIN game g ON g.game_id = gp.game_id AND g.external_id LIKE 'nba:%'
    LEFT JOIN shooting ON 'nba:' || shooting.source_player_id = p.external_id
    LEFT JOIN LATERAL (
      SELECT
        (MAX(cm.value) FILTER (WHERE cm.measurement_type = 'wingspan_cm'))::double precision AS wingspan_cm,
        (MAX(cm.value) FILTER (WHERE cm.measurement_type = 'vertical_leap_cm'))::double precision AS vertical_leap_cm
      FROM combined_measurement cm
      WHERE cm.player_id = p.player_id
    ) measurements ON true
    GROUP BY
      p.player_id, p.f_name, p.l_name, p.position, p.height_cm, p.weight_kg,
      measurements.wingspan_cm, measurements.vertical_leap_cm, shooting.made, shooting.attempts, shooting.games
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
      .filter((player) => archetype.score(player) >= 0)
      .sort((left, right) => {
        const scoreDifference = archetype.score(right) - archetype.score(left);
        return scoreDifference || left.player_id.localeCompare(right.player_id);
      })
      .slice(0, Math.min(30, players.length)),
  }));

  for (const { archetype, players: rankedPlayers } of archetypeProfiles) {
    if (rankedPlayers.length < REPORTS_PER_ARCHETYPE) throw new Error(`Not enough eligible players for ${archetype.key}`);
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
  const outputDirectory = process.env.DRAFTBOARD_SEED_OUTPUT_DIR
    ? resolve(process.env.DRAFTBOARD_SEED_OUTPUT_DIR)
    : resolve(ROOT, "db", "seed");
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
