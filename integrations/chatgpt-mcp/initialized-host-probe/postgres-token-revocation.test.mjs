import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRevocationBackend } from '../adapters/postgres-token-revocation.mjs';
const identity = { issuer: 'https://identity.example', subject: 'alice', tokenId: 'token-1' };
test('revocation persists across backend instances and database errors deny', async () => {
  const rows = new Set();
  let offline = false;
  const query = async (sql, params, opts) => {
    assert.equal(opts.readFromPrimary, true);
    if (offline) throw Error('offline');
    if (sql.startsWith('INSERT')) { rows.add(params[0]); return { rowCount: 1 }; }
    return { rows: rows.has(params[0]) ? [{ revoked: true }] : [] };
  };
  const a = createPostgresRevocationBackend({ query });
  assert.equal(await a.isRevoked(identity), false);
  await a.revoke(identity);
  const b = createPostgresRevocationBackend({ query });
  await assert.rejects(b.isRevoked(identity), /denied/);
  assert.equal(await b.isRevoked({ ...identity, tokenId: 'other' }), false);
  offline = true;
  await assert.rejects(b.isRevoked(identity), /denied/);
  await assert.rejects(b.revoke(identity), /denied/);
});
test('indeterminate DB responses and timeout deny', async () => {
  const invalid = createPostgresRevocationBackend({ query: async () => ({}) });
  await assert.rejects(invalid.isRevoked(identity), /denied/);
  await assert.rejects(invalid.revoke(identity), /denied/);
  const stalled = createPostgresRevocationBackend({
    query: () => new Promise(() => {}), timeoutMs: 50,
  });
  await assert.rejects(stalled.isRevoked(identity), /denied/);
});
