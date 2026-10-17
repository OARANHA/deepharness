-- REVIEW ONLY. Existing dedicated primary; separate owner approval required.
-- Deliberately refuses a preexisting database-specific deadline override.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $$
DECLARE r pg_roles%ROWTYPE; db_oid oid;
BEGIN
  IF current_database() <> 'dsh_mcp_grants' OR pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Reader timeout migration target denied';
  END IF;
  SELECT * INTO STRICT r FROM pg_roles WHERE rolname='dsh_mcp_reader';
  IF r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
    OR NOT (coalesce(r.rolconfig,ARRAY[]::text[]) @> ARRAY['statement_timeout=1500ms']) THEN
    RAISE EXCEPTION 'Reader role baseline denied';
  END IF;
  SELECT oid INTO STRICT db_oid FROM pg_database WHERE datname=current_database();
  IF EXISTS (SELECT 1 FROM pg_db_role_setting s, unnest(s.setconfig) c
    WHERE s.setdatabase=db_oid AND s.setrole=r.oid AND c LIKE 'statement_timeout=%') THEN
    RAISE EXCEPTION 'Preexisting database deadline denied';
  END IF;
END $$;
ALTER ROLE dsh_mcp_reader IN DATABASE dsh_mcp_grants SET statement_timeout='750ms';
COMMIT;
