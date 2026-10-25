-- Reset only the DraftBoard application schema in the connected database.
-- Run with ON_ERROR_STOP=1. This is intentionally separate from migrations.
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
