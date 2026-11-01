import { pool } from "./pg";
import { EMBEDDING_MODEL } from "../embeddings/config";
import { embedText } from "../embeddings/embed";
import { toSql } from "pgvector/pg";
import type { z } from "zod";
import type { reportSearchSchema } from "../validators/search";

export async function searchReports(v:z.infer<typeof reportSearchSchema>) {
  const vector=toSql(await embedText(v.q));
  return (await pool.query(`SELECT r.report_id, r.player_id, r.scout_id, r.summary, p.f_name, p.l_name, p.position,
    1-(r.embedding <=> $1::vector) AS similarity
    FROM scouting_report r JOIN player p ON p.player_id=r.player_id
    WHERE r.embedding IS NOT NULL AND r.embedding_model=$2
      AND ($3::player_position IS NULL OR p.position=$3)
      AND ($4::text IS NULL OR NOT EXISTS (SELECT 1 FROM injury_history i WHERE i.player_id=p.player_id AND
        CASE i.severity WHEN 'minor' THEN 1 WHEN 'moderate' THEN 2 WHEN 'severe' THEN 3 END >
        CASE $4::text WHEN 'minor' THEN 1 WHEN 'moderate' THEN 2 WHEN 'severe' THEN 3 END))
    ORDER BY r.embedding <=> $1::vector, r.report_id LIMIT $5`,[vector,EMBEDDING_MODEL,v.position ?? null,v.maxInjurySeverity ?? null,v.k])).rows;
}
export async function keyword(q:string, limit:number) {
  return (await pool.query(`SELECT r.report_id, r.player_id, r.scout_id, r.summary, p.f_name, p.l_name, p.position,
    ts_rank(r.search_vector, plainto_tsquery('english', $1)) AS rank,
    ts_headline('english', r.summary, plainto_tsquery('english', $1), 'StartSel=<mark>, StopSel=</mark>') AS headline
    FROM scouting_report r JOIN player p ON p.player_id=r.player_id
    WHERE r.search_vector @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC, r.report_id LIMIT $2`,[q,limit])).rows;
}
export async function similarReports(id:string, limit:number) {
  const source=await pool.query("SELECT 1 FROM scouting_report WHERE report_id=$1",[id]); if(!source.rowCount)return null;
  return (await pool.query(`SELECT r.report_id, r.player_id, r.scout_id, r.summary,
    1-(r.embedding <=> source.embedding) AS similarity
    FROM scouting_report source JOIN scouting_report r ON r.report_id<>source.report_id
    WHERE source.report_id=$1 AND source.embedding IS NOT NULL AND source.embedding_model=$2
      AND r.embedding IS NOT NULL AND r.embedding_model=$2
    ORDER BY r.embedding <=> source.embedding, r.report_id LIMIT $3`,[id,EMBEDDING_MODEL,limit])).rows;
}
export async function similarPlayers(id:string, limit:number) {
  const source=await pool.query("SELECT 1 FROM player WHERE player_id=$1",[id]); if(!source.rowCount)return null;
  return (await pool.query(`SELECT p.player_id, p.f_name, p.l_name, p.position,
    max(1-(r.embedding <=> source.embedding)) AS similarity
    FROM scouting_report source JOIN scouting_report r ON r.player_id<>source.player_id
    JOIN player p ON p.player_id=r.player_id
    WHERE source.player_id=$1 AND source.embedding IS NOT NULL AND source.embedding_model=$2
      AND r.embedding IS NOT NULL AND r.embedding_model=$2
    GROUP BY p.player_id ORDER BY similarity DESC, p.player_id LIMIT $3`,[id,EMBEDDING_MODEL,limit])).rows;
}
export async function playerNews(id:string, limit:number) {
  const source=await pool.query("SELECT 1 FROM player WHERE player_id=$1",[id]); if(!source.rowCount)return null;
  return (await pool.query(`SELECT n.article_id,n.title,n.summary,n.publish_date,n.url,
    EXISTS(SELECT 1 FROM article_mention m WHERE m.article_id=n.article_id AND m.player_id=$1) AS exact_mention,
    (SELECT max(1-(n.embedding <=> r.embedding)) FROM scouting_report r
      WHERE r.player_id=$1 AND r.embedding IS NOT NULL AND r.embedding_model=$2
        AND n.embedding IS NOT NULL AND n.embedding_model=$2) AS similarity
    FROM news_article n
    WHERE (n.embedding IS NOT NULL AND n.embedding_model=$2 AND EXISTS
      (SELECT 1 FROM scouting_report r WHERE r.player_id=$1 AND r.embedding IS NOT NULL AND r.embedding_model=$2))
      OR EXISTS(SELECT 1 FROM article_mention m WHERE m.article_id=n.article_id AND m.player_id=$1)
    ORDER BY similarity DESC NULLS LAST, exact_mention DESC, n.article_id LIMIT $3`,[id,EMBEDDING_MODEL,limit])).rows;
}
