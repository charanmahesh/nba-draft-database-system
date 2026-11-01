import { pool } from "./pg";
import { embedText } from "../embeddings/embed";
import { EMBEDDING_MODEL } from "../embeddings/config";
import { toSql } from "pgvector/pg";
import type { z } from "zod";
import type { reportCreate, newsCreate, newsEdit } from "../validators/documents";

export async function listReports(page:number, limit:number, scoutId:string|null=null) { return (await pool.query("SELECT * FROM fn_workspace_reports($1,$2,$3)",[limit,(page-1)*limit,scoutId])).rows; }
export async function listNews(page:number, limit:number) { return (await pool.query("SELECT article_id, title, publish_date, summary, url, CASE WHEN embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM news_article ORDER BY article_id DESC LIMIT $1 OFFSET $2",[limit,(page-1)*limit])).rows; }
export async function getReport(id:string) { return (await pool.query("SELECT report_id, player_id, scout_id, report_date, summary, CASE WHEN embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM scouting_report WHERE report_id=$1",[id])).rows[0]; }
export async function getNews(id:string) { return (await pool.query("SELECT article_id, title, publish_date, summary, url, CASE WHEN embedding IS NULL THEN 'pending' ELSE 'indexed' END AS embedding_status FROM news_article WHERE article_id=$1",[id])).rows[0]; }
export async function createReport(v:z.infer<typeof reportCreate>, scout:string) { return (await pool.query("INSERT INTO scouting_report (player_id, scout_id, report_date, summary) VALUES ($1,$2,coalesce($3::date,current_date),$4) RETURNING report_id",[v.player_id,scout,v.report_date ?? null,v.summary])).rows[0].report_id as string; }
export async function updateReport(id:string, summary:string) { await pool.query("UPDATE scouting_report SET summary=$2 WHERE report_id=$1",[id,summary]); }
export async function createNews(v:z.infer<typeof newsCreate>) { return (await pool.query("INSERT INTO news_article (title,publish_date,summary,url) VALUES ($1,$2,$3,$4) RETURNING article_id",[v.title,v.publish_date,v.summary,v.url ?? null])).rows[0].article_id as string; }
export async function updateNews(id:string, v:z.infer<typeof newsEdit>) { await pool.query("UPDATE news_article SET title=coalesce($2,title), publish_date=coalesce($3::date,publish_date), summary=coalesce($4,summary), url=CASE WHEN $5 THEN $6 ELSE url END WHERE article_id=$1",[id,v.title ?? null,v.publish_date ?? null,v.summary ?? null,Object.hasOwn(v,"url"),v.url ?? null]); }
export async function deleteReport(id:string) { return (await pool.query("DELETE FROM scouting_report WHERE report_id=$1 RETURNING report_id",[id])).rowCount; }
export async function deleteNews(id:string) { return (await pool.query("DELETE FROM news_article WHERE article_id=$1 RETURNING article_id",[id])).rowCount; }
// Guard the update against a concurrent text edit while the model is running.
export async function indexReport(id:string) { const row=await getReport(id); if (!row) return; try { const vector=await embedText(row.summary); await pool.query("UPDATE scouting_report SET embedding=$2::vector, embedding_model=$3, embedded_at=now() WHERE report_id=$1 AND summary=$4",[id,toSql(vector),EMBEDDING_MODEL,row.summary]); } catch (error) { console.error("Report embedding failed", error); } }
export async function indexNews(id:string) { const row=await getNews(id); if (!row) return; try { const vector=await embedText(`${row.title}. ${row.summary}`); await pool.query("UPDATE news_article SET embedding=$2::vector, embedding_model=$3, embedded_at=now() WHERE article_id=$1 AND title=$4 AND summary=$5",[id,toSql(vector),EMBEDDING_MODEL,row.title,row.summary]); } catch (error) { console.error("News embedding failed", error); } }
