-- Phase 1 DDL demonstration. Every operation is repeatable.

-- Add a useful schema attribute after the initial table definition.
ALTER TABLE team ADD COLUMN IF NOT EXISTS abbreviation TEXT;

-- Modify the table definition with an additional integrity constraint.
ALTER TABLE team ALTER COLUMN team_name SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_team_abbreviation_format'
      AND conrelid = 'team'::regclass
  ) THEN
    ALTER TABLE team
      ADD CONSTRAINT chk_team_abbreviation_format
      CHECK (abbreviation IS NULL OR abbreviation ~ '^[A-Z0-9]{2,5}$');
  END IF;
END
$$;

-- Add an index through DDL rather than embedding it in the base table file.
CREATE INDEX IF NOT EXISTS idx_team_abbreviation ON team(abbreviation);

-- Demonstrate dropping a temporary object without affecting the application schema.
CREATE TABLE IF NOT EXISTS alter_demo_scratch (scratch_id INTEGER PRIMARY KEY);
CREATE INDEX IF NOT EXISTS idx_alter_demo_scratch ON alter_demo_scratch(scratch_id);
DROP INDEX IF EXISTS idx_alter_demo_scratch;
DROP TABLE IF EXISTS alter_demo_scratch;
