import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPostgresRevocationBackend } from '../adapters/postgres-token-revocation.mjs';

const url = process.env.TEST_POSTGRES_URL;
let target;
try { target = new URL(url); } catch { throw new Error('Isolated loopback TEST_POSTGRES_URL is required'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.hostname !== '127.0.0.1' || target.port !== '5432' ||
    target.pathname !== '/token_revocation_test' || target.search || target.hash) {
  throw new Error('Isolated loopback TEST_POSTGRES_URL is required');
}
const schema = new URL('../sql/001_token_revocations.sql', import.meta.url);
const identity = { issuer: 'https://issuer.example', subject: 'alice', tokenId: 'integration-jti-1' };
const open = () => new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 1000,
  idleTimeoutMillis: 1000, allowExitOnIdle: true });
const adapter = pool => createPostgresRevocationBackend({
  query: (sql, params) => pool.query(sql, params), timeoutMs: 500,
});
test('real PostgreSQL revocation survives client restart, rejects failure and isolates tokens', async () => {
  const first = open();
  try {
    await first.query(await readFile(schema, 'utf8'));
    await first.query('TRUNCATE chatgpt_mcp_token_revocations');
    const revocation = adapter(first);
    assert.equal(await revocation.isRevoked(identity), false);
    await revocation.revoke(identity);
    await assert.rejects(revocation.isRevoked(identity), /denied/);
    await revocation.revoke(identity); // idempotent
    const stored = await first.query('SELECT token_hash, revoked FROM chatgpt_mcp_token_revocations');
    assert.equal(stored.rowCount, 1);
    assert.match(stored.rows[0].token_hash.trim(), /^[0-9a-f]{64}$/);
    assert.equal(stored.rows[0].revoked, true);
  } finally { await first.end(); }

  // A new pool has no inherited local memory; the database retains revocation.
  const second = open();
  try {
    const revocation = adapter(second);
    await assert.rejects(revocation.isRevoked(identity), /denied/);
    assert.equal(await revocation.isRevoked({ ...identity, tokenId: 'different' }), false);
    assert.equal(await revocation.isRevoked({ ...identity, subject: 'bob' }), false);
  } finally { await second.end(); }

  // A closed database client cannot produce a permissive authorization result.
  const unavailable = adapter(second);
  await assert.rejects(unavailable.isRevoked(identity), /denied/);
  await assert.rejects(unavailable.revoke(identity), /denied/);
});
