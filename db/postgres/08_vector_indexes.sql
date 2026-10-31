-- Phase 3C indexes. Run after embedding reports and articles.
-- Partial indexes avoid indexing rows that are still awaiting backfill.

CREATE INDEX IF NOT EXISTS idx_scouting_report_embedding_hnsw
  ON scouting_report
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_article_embedding_hnsw
  ON news_article
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
