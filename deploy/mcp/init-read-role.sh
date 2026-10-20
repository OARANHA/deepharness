#!/bin/sh
# Called only by the official image when initializing a NEW authorization DB.
set -eu
test "$POSTGRES_DB" = dsh_mcp_grants
test "$POSTGRES_USER" = dsh_mcp_owner
reader_password="$(cat /run/secrets/mcp-runtime-db-password)"
case "$reader_password" in ''|*[!a-f0-9]*) exit 1;; esac
test "${#reader_password}" -eq 64
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=reader_password="$reader_password" <<'SQL'
CREATE ROLE dsh_mcp_reader LOGIN PASSWORD :'reader_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
REVOKE ALL ON DATABASE dsh_mcp_grants FROM PUBLIC;
GRANT CONNECT ON DATABASE dsh_mcp_grants TO dsh_mcp_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dsh_mcp_reader;
GRANT SELECT ON public.chatgpt_mcp_token_revocations, public.chatgpt_mcp_read_grants TO dsh_mcp_reader;
ALTER ROLE dsh_mcp_reader SET search_path = public;
ALTER ROLE dsh_mcp_reader SET default_transaction_read_only = on;
ALTER ROLE dsh_mcp_reader SET statement_timeout = '1500ms';
SQL
unset reader_password
