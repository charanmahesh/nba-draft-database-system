-- Phase 3B synthetic application-supporting data only.
-- Requires the Phase 3A NBA import so teams exist. No player performance,
-- measurement, injury, prospect, report, or article data is inserted here.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM team) THEN
    RAISE EXCEPTION 'Run the Phase 3A NBA import before db/postgres/06_seed.sql';
  END IF;
END
$$;

INSERT INTO person (f_name, l_name, email, password_hash, role)
VALUES
  ('DraftBoard', 'Admin', 'admin@draftboard.local',
   '$2a$10$Qwz6VqgkvuXfX0IlZeC20u6PvfG5sYDURIaY4yeV3pBbuNsvt3bU.', 'admin'),
  ('Demo', 'Scout', 'scout@draftboard.local',
   '$2a$10$Qwz6VqgkvuXfX0IlZeC20u6PvfG5sYDURIaY4yeV3pBbuNsvt3bU.', 'scout'),
  ('Demo', 'Analyst', 'analyst@draftboard.local',
   '$2a$10$Qwz6VqgkvuXfX0IlZeC20u6PvfG5sYDURIaY4yeV3pBbuNsvt3bU.', 'analyst'),
  ('Demo', 'Manager', 'manager@draftboard.local',
   '$2a$10$Qwz6VqgkvuXfX0IlZeC20u6PvfG5sYDURIaY4yeV3pBbuNsvt3bU.', 'team_manager')
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash
WHERE person.role = EXCLUDED.role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('admin@draftboard.local', 'admin'::person_role),
      ('scout@draftboard.local', 'scout'::person_role),
      ('analyst@draftboard.local', 'analyst'::person_role),
      ('manager@draftboard.local', 'team_manager'::person_role)
    ) AS expected(email, role)
    LEFT JOIN person p ON p.email = expected.email
    WHERE p.person_id IS NULL OR p.role <> expected.role
  ) THEN
    RAISE EXCEPTION 'A seeded demo email already exists with a different role';
  END IF;
END
$$;

INSERT INTO admin (person_id)
SELECT person_id FROM person WHERE email = 'admin@draftboard.local'
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO scout (person_id, experience)
SELECT person_id, 5 FROM person WHERE email = 'scout@draftboard.local'
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO analyst (person_id, specialization)
SELECT person_id, 'NBA performance analytics'
FROM person WHERE email = 'analyst@draftboard.local'
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO team_manager (person_id, team_id)
SELECT p.person_id, (SELECT MIN(team_id) FROM team)
FROM person p
WHERE p.email = 'manager@draftboard.local'
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO team_need (team_id, position, priority, description)
SELECT t.team_id, needs.position, needs.priority,
       'Phase 3B demo seed: ' || needs.position::text || ' roster depth'
FROM team t
CROSS JOIN (VALUES
  ('PG'::player_position, 4::smallint),
  ('SG'::player_position, 3::smallint),
  ('SF'::player_position, 3::smallint),
  ('PF'::player_position, 2::smallint),
  ('C'::player_position, 4::smallint)
) AS needs(position, priority)
WHERE NOT EXISTS (
  SELECT 1
  FROM team_need existing
  WHERE existing.team_id = t.team_id
    AND existing.position = needs.position
    AND existing.description LIKE 'Phase 3B demo seed:%'
);

INSERT INTO roster (team_id, season, is_historical)
SELECT t.team_id, EXTRACT(YEAR FROM CURRENT_DATE)::smallint, false
FROM team t
ON CONFLICT (team_id, season) DO NOTHING;

COMMIT;
