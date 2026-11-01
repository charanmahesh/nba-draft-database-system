-- DraftBoard Phase 2 trigger functions and triggers.

CREATE OR REPLACE FUNCTION trg_enforce_roster_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_historical BOOLEAN;
  v_roster_size BIGINT;
BEGIN
  SELECT r.is_historical
  INTO v_is_historical
  FROM roster r
  WHERE r.roster_id = NEW.roster_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster % does not exist', NEW.roster_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT v_is_historical THEN
    SELECT COUNT(*)
    INTO v_roster_size
    FROM roster_player rp
    WHERE rp.roster_id = NEW.roster_id;

    IF v_roster_size >= 15 THEN
      RAISE EXCEPTION 'Roster % cannot contain more than 15 players', NEW.roster_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roster_size_cap ON roster_player;
CREATE TRIGGER roster_size_cap
BEFORE INSERT ON roster_player
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_roster_size();

CREATE OR REPLACE FUNCTION trg_validate_game_performance_team()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_home_team BIGINT;
  v_away_team BIGINT;
BEGIN
  SELECT g.home_team_id, g.away_team_id
  INTO v_home_team, v_away_team
  FROM game g
  WHERE g.game_id = NEW.game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game % does not exist', NEW.game_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.team_id NOT IN (v_home_team, v_away_team) THEN
    RAISE EXCEPTION 'Performance team % did not participate in game %', NEW.team_id, NEW.game_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_performance_team_check ON game_performance;
CREATE TRIGGER game_performance_team_check
BEFORE INSERT OR UPDATE OF game_id, team_id ON game_performance
FOR EACH ROW
EXECUTE FUNCTION trg_validate_game_performance_team();

CREATE OR REPLACE FUNCTION trg_write_roster_player_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN
  v_changed_by := NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, action, record_key, old_data, new_data, changed_by)
    VALUES (
      TG_TABLE_NAME, TG_OP,
      format('%s:%s', NEW.roster_id, NEW.player_id),
      NULL, to_jsonb(NEW), v_changed_by
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, action, record_key, old_data, new_data, changed_by)
    VALUES (
      TG_TABLE_NAME, TG_OP,
      format('%s:%s', NEW.roster_id, NEW.player_id),
      to_jsonb(OLD), to_jsonb(NEW), v_changed_by
    );
    RETURN NEW;
  ELSE
    INSERT INTO audit_log (table_name, action, record_key, old_data, new_data, changed_by)
    VALUES (
      TG_TABLE_NAME, TG_OP,
      format('%s:%s', OLD.roster_id, OLD.player_id),
      to_jsonb(OLD), NULL, v_changed_by
    );
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS roster_player_audit ON roster_player;
CREATE TRIGGER roster_player_audit
AFTER INSERT OR UPDATE OR DELETE ON roster_player
FOR EACH ROW
EXECUTE FUNCTION trg_write_roster_player_audit();

CREATE OR REPLACE FUNCTION trg_validate_person_subtype()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id BIGINT := COALESCE(NEW.person_id, OLD.person_id);
  v_role person_role;
  v_has_subtype BOOLEAN := false;
BEGIN
  SELECT p.role INTO v_role FROM person p WHERE p.person_id = v_person_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  CASE v_role
    WHEN 'scout' THEN
      SELECT EXISTS (SELECT 1 FROM scout s WHERE s.person_id = v_person_id) INTO v_has_subtype;
    WHEN 'analyst' THEN
      SELECT EXISTS (SELECT 1 FROM analyst a WHERE a.person_id = v_person_id) INTO v_has_subtype;
    WHEN 'team_manager' THEN
      SELECT EXISTS (SELECT 1 FROM team_manager tm WHERE tm.person_id = v_person_id) INTO v_has_subtype;
    WHEN 'admin' THEN
      SELECT EXISTS (SELECT 1 FROM admin ad WHERE ad.person_id = v_person_id) INTO v_has_subtype;
  END CASE;

  IF NOT v_has_subtype THEN
    RAISE EXCEPTION 'Person % with role % must have a matching subtype row', v_person_id, v_role
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS person_subtype_consistency ON person;
CREATE CONSTRAINT TRIGGER person_subtype_consistency
AFTER INSERT OR UPDATE OF role ON person
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_validate_person_subtype();

DROP TRIGGER IF EXISTS scout_subtype_consistency ON scout;
CREATE CONSTRAINT TRIGGER scout_subtype_consistency
AFTER INSERT OR UPDATE OR DELETE ON scout
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_validate_person_subtype();

DROP TRIGGER IF EXISTS analyst_subtype_consistency ON analyst;
CREATE CONSTRAINT TRIGGER analyst_subtype_consistency
AFTER INSERT OR UPDATE OR DELETE ON analyst
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_validate_person_subtype();

DROP TRIGGER IF EXISTS team_manager_subtype_consistency ON team_manager;
CREATE CONSTRAINT TRIGGER team_manager_subtype_consistency
AFTER INSERT OR UPDATE OR DELETE ON team_manager
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_validate_person_subtype();

DROP TRIGGER IF EXISTS admin_subtype_consistency ON admin;
CREATE CONSTRAINT TRIGGER admin_subtype_consistency
AFTER INSERT OR UPDATE OR DELETE ON admin
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_validate_person_subtype();

CREATE OR REPLACE FUNCTION trg_clear_stale_report_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.summary IS DISTINCT FROM OLD.summary THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    NEW.embedded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scouting_report_clear_embedding ON scouting_report;
CREATE TRIGGER scouting_report_clear_embedding
BEFORE UPDATE OF summary ON scouting_report
FOR EACH ROW
EXECUTE FUNCTION trg_clear_stale_report_embedding();

CREATE OR REPLACE FUNCTION trg_clear_stale_news_embedding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.summary IS DISTINCT FROM OLD.summary THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    NEW.embedded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS news_article_clear_embedding ON news_article;
CREATE TRIGGER news_article_clear_embedding BEFORE UPDATE OF title, summary ON news_article
FOR EACH ROW EXECUTE FUNCTION trg_clear_stale_news_embedding();
