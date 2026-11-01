import { pool } from "./pg";

export async function getTeamMatch(teamId: string) {
  const team = await pool.query("SELECT 1 FROM team WHERE team_id = $1", [teamId]);
  if (!team.rowCount) return null;
  const result = await pool.query("SELECT * FROM fn_match_players_for_team($1)", [teamId]);
  return result.rows;
}
