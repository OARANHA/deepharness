-- Operator-managed exact read grants. Apply only after explicit environment approval.
-- Hash = SHA256(JSON.stringify([principalId, workspaceId, leadSessionId])).
-- No default grants, wildcard matching, trigger, or startup seed.
CREATE TABLE IF NOT EXISTS chatgpt_mcp_read_grants (
  grant_hash CHAR(64) PRIMARY KEY CHECK (grant_hash ~ '^[0-9a-f]{64}$'),
  allowed BOOLEAN NOT NULL
);
