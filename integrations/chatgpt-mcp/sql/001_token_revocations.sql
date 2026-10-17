-- Apply only after explicit infrastructure approval, on a trusted PostgreSQL primary.
-- Never store bearer tokens or plaintext JWT IDs.
CREATE TABLE IF NOT EXISTS chatgpt_mcp_token_revocations (
  token_hash CHAR(64) PRIMARY KEY,
  revoked BOOLEAN NOT NULL DEFAULT TRUE CHECK (revoked = TRUE),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Database roles: runtime read via SELECT, revocation writer INSERT/UPDATE.
-- Never authorize from asynchronous replicas or an in-memory negative cache.
