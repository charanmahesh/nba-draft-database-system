-- DraftBoard Phase 2 views.

CREATE OR REPLACE VIEW v_player_profile AS
WITH ranked_measurements AS (
  SELECT
    cm.player_id,
    cm.measurement_type,
    cm.value,
    cm.unit,
    cm.combine_year,
    ROW_NUMBER() OVER (
      PARTITION BY cm.player_id, cm.measurement_type
      ORDER BY cm.combine_year DESC, cm.measurement_id DESC
    ) AS measurement_rank
  FROM combined_measurement cm
), latest_measurements AS (
  SELECT
    rm.player_id,
    jsonb_object_agg(
      rm.measurement_type::text,
      jsonb_build_object(
        'value', rm.value,
        'unit', rm.unit,
        'combineYear', rm.combine_year
      )
    ) AS measurements
  FROM ranked_measurements rm
  WHERE rm.measurement_rank = 1
  GROUP BY rm.player_id
), injury_counts AS (
  SELECT ih.player_id, COUNT(*)::BIGINT AS injury_count
  FROM injury_history ih
  GROUP BY ih.player_id
)
SELECT
  p.player_id,
  p.external_id,
  p.f_name,
  p.l_name,
  p.dob,
  p.height_cm,
  p.weight_kg,
  p.position,
  p.secondary_position,
  COALESCE(lm.measurements, '{}'::jsonb) AS latest_measurements,
  COALESCE(ic.injury_count, 0)::BIGINT AS injury_count
FROM player p
LEFT JOIN latest_measurements lm ON lm.player_id = p.player_id
LEFT JOIN injury_counts ic ON ic.player_id = p.player_id;

CREATE OR REPLACE VIEW v_team_open_needs AS
SELECT
  tn.need_id,
  t.team_id,
  t.team_name,
  t.city,
  tn.position,
  tn.priority,
  tn.description,
  tn.is_filled
FROM team_need tn
JOIN team t ON t.team_id = tn.team_id
WHERE tn.is_filled = false;

CREATE OR REPLACE VIEW v_prospect_board AS
SELECT
  dp.prospect_id,
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  p.secondary_position,
  p.height_cm,
  p.weight_kg,
  dp.college,
  dp.class_year,
  COALESCE(AVG(gp.points), 0)::NUMERIC AS avg_points,
  COALESCE(AVG(gp.rebounds), 0)::NUMERIC AS avg_rebounds,
  COALESCE(AVG(gp.assists), 0)::NUMERIC AS avg_assists,
  latest_report.report_id AS latest_report_id,
  latest_report.report_date AS latest_report_date,
  latest_report.summary AS latest_report_summary
FROM draft_prospect dp
JOIN player p ON p.player_id = dp.player_id
LEFT JOIN game_performance gp ON gp.player_id = p.player_id
LEFT JOIN LATERAL (
  SELECT sr.report_id, sr.report_date, sr.summary
  FROM scouting_report sr
  WHERE sr.player_id = p.player_id
  ORDER BY sr.report_date DESC, sr.report_id DESC
  LIMIT 1
) latest_report ON true
GROUP BY
  dp.prospect_id,
  p.player_id,
  p.f_name,
  p.l_name,
  p.position,
  p.secondary_position,
  p.height_cm,
  p.weight_kg,
  dp.college,
  dp.class_year,
  latest_report.report_id,
  latest_report.report_date,
  latest_report.summary;
