import { pool } from "./pg";
import type { PlayerListInput } from "../validators/players";
export async function listPlayers(input: PlayerListInput) {
  const result = await pool.query(`
    WITH matching AS (
      SELECT p.player_id, p.f_name, p.l_name, p.position, p.height_cm, p.weight_kg,
        count(gp.performance_id)::int AS games, round(avg(gp.points), 2) AS avg_points
      FROM player p
      LEFT JOIN game_performance gp ON gp.player_id = p.player_id
      LEFT JOIN game g ON g.game_id = gp.game_id
      WHERE ($1::player_position IS NULL OR p.position = $1)
        AND ($2::text IS NULL OR concat_ws(' ', p.f_name, p.l_name) ILIKE '%' || $2 || '%')
        AND ($3::smallint IS NULL OR g.season = $3)
        AND ($4::bigint IS NULL OR gp.team_id = $4)
      GROUP BY p.player_id
      HAVING count(gp.performance_id) >= $5
    )
    SELECT matching.*, totals.total FROM (SELECT count(*)::int AS total FROM matching) totals LEFT JOIN LATERAL (SELECT * FROM matching
    ORDER BY CASE WHEN $6 = 'points' THEN avg_points END DESC NULLS LAST,
             CASE WHEN $6 = 'games' THEN games END DESC NULLS LAST,
             l_name, f_name, player_id
    LIMIT $7 OFFSET $8) matching ON true
`, [input.position ?? null, input.name ?? null, input.season ?? null, input.team ?? null, input.minGames, input.sort, input.limit, (input.page - 1) * input.limit]);
  const total = result.rows[0]?.total ?? 0;
  const items = result.rows.filter(row => row.player_id !== null).map(({ total: _total, ...row }) => row);
  return { items, total, page: input.page, limit: input.limit };
}
export async function getPlayer(id: string) {
  const player = await pool.query("SELECT * FROM v_player_profile WHERE player_id = $1", [id]);
  if (!player.rowCount) return null;
  const [stats, measurements, injuries, reports, news] = await Promise.all([
    pool.query(`SELECT g.season, count(*)::int AS games, round(avg(gp.minutes),2) AS minutes, round(avg(gp.points),2) AS points, round(avg(gp.rebounds),2) AS rebounds, round(avg(gp.assists),2) AS assists, round(avg(gp.steals),2) AS steals, round(avg(gp.blocks),2) AS blocks FROM game_performance gp JOIN game g USING (game_id) WHERE gp.player_id = $1 GROUP BY g.season ORDER BY g.season DESC`, [id]),
    pool.query("SELECT * FROM combined_measurement WHERE player_id = $1 ORDER BY combine_year DESC, measurement_type", [id]),
    pool.query("SELECT * FROM injury_history WHERE player_id = $1 ORDER BY injury_date DESC", [id]),
    pool.query("SELECT report_id, player_id, scout_id, report_date, summary, CASE WHEN embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM scouting_report WHERE player_id = $1 ORDER BY report_date DESC, report_id DESC", [id]),
    pool.query("SELECT n.article_id, n.title, n.publish_date, n.summary, n.url FROM news_article n JOIN article_mention am USING (article_id) WHERE am.player_id = $1 ORDER BY n.publish_date DESC, n.article_id DESC", [id]),
  ]);
  return { ...player.rows[0], season_averages: stats.rows, measurements: measurements.rows, injuries: injuries.rows, reports: reports.rows, news: news.rows };
}
