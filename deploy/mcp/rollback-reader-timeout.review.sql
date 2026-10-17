-- REVIEW ONLY. Paired with migrate-reader-timeout.review.sql, never a blanket reset.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $$
DECLARE r pg_roles%ROWTYPE; db_oid oid;
BEGIN
  IF current_database() <> 'dsh_mcp_grants' OR pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Reader timeout rollback target denied';
  END IF;
  SELECT * INTO STRICT r FROM pg_roles WHERE rolname='dsh_mcp_reader';
  SELECT oid INTO STRICT db_oid FROM pg_database WHERE datname=current_database();
  IF NOT (coalesce(r.rolconfig,ARRAY[]::text[]) @> ARRAY['statement_timeout=1500ms']) OR
    NOT EXISTS (SELECT 1 FROM pg_db_role_setting s WHERE s.setdatabase=db_oid AND s.setrole=r.oid
      AND s.setconfig @> ARRAY['statement_timeout=750ms']) THEN
    RAISE EXCEPTION 'Reader rollback baseline changed';
  END IF;
END $$;
ALTER ROLE dsh_mcp_reader IN DATABASE dsh_mcp_grants RESET statement_timeout;
COMMIT;
