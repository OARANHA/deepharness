import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createScopedReadGrants } from '../adapters/scoped-read-grants.mjs';
import { createPostgresReadGrantStore } from '../adapters/postgres-read-grants.mjs';

const exact = Object.freeze({
  principalId: 'https://id.example.test/realms/dsh#individual-1',
  workspaceId: 'workspace-1',
  leadSessionId: 'lead-1',
});
const grantHash = createHash('sha256')
  .update(JSON.stringify([exact.principalId, exact.workspaceId, exact.leadSessionId]))
  .digest('hex');

test('in-memory exact grants start denied and reject wildcard, collision and partial update', () => {
  const grants = createScopedReadGrants();
  assert.equal(grants.hasReadGrant(exact), false);
  grants.replace([exact]);
  assert.equal(grants.hasReadGrant(exact), true);
  for (const key of Object.keys(exact)) {
    assert.equal(grants.hasReadGrant({ ...exact, [key]: 'different' }), false);
    assert.throws(() => grants.replace([{ ...exact, [key]: '*' }]), /invalid read grants/);
    assert.equal(grants.hasReadGrant(exact), true);
  }
  const ab = createScopedReadGrants([{ principalId: 'a/b', workspaceId: 'c', leadSessionId: 'd' }]);
  assert.equal(ab.hasReadGrant({ principalId: 'a', workspaceId: 'b/c', leadSessionId: 'd' }), false);
  assert.equal(grants.revoke(exact), true);
  assert.equal(grants.hasReadGrant(exact), false);
});

test('Postgres grants query exact tuple hash on every read with authoritative-primary intent', async () => {
  let reads = 0;
  let allowed = true;
  const store = createPostgresReadGrantStore({
    query: async (sql, params, opts) => {
      reads++;
      assert.match(sql, /^SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = \$1$/);
      assert.deepEqual(params, [grantHash]);
      assert.equal(opts.readFromPrimary, true);
      assert.ok(opts.signal instanceof AbortSignal);
      return { rows: [{ allowed }] };
    },
  });
  assert.deepEqual(Object.keys(store), ['hasReadGrant']);
  assert.ok(Object.isFrozen(store));
  assert.equal(await store.hasReadGrant(exact), true);
  allowed = false;
  assert.equal(await store.hasReadGrant(exact), false);
  assert.equal(reads, 2);
});

test('ungranted or explicitly false grants deny without a fallback', async () => {
  const missing = createPostgresReadGrantStore({ query: async () => ({ rows: [] }) });
  const disabled = createPostgresReadGrantStore({ query: async () => ({ rows: [{ allowed: false }] }) });
  assert.equal(await missing.hasReadGrant(exact), false);
  assert.equal(await disabled.hasReadGrant(exact), false);
});

test('invalid grants are rejected before any PostgreSQL query', async () => {
  let called = 0;
  const store = createPostgresReadGrantStore({
    query: async () => { called++; return { rows: [{ allowed: true }] }; },
  });
  for (const key of Object.keys(exact)) {
    for (const invalid of ['*', '', ' trim', 3, 'x'.repeat(257)]) {
      await assert.rejects(store.hasReadGrant({ ...exact, [key]: invalid }), /read denied/);
    }
  }
  await assert.rejects(store.hasReadGrant(undefined), /read denied/);
  assert.equal(called, 0);
});

test('ambiguous rows, malformed booleans, backend failures and timeouts deny', async () => {
  for (const value of [
    null, {}, { rows: undefined }, { rows: [{ allowed: 'true' }] },
    { rows: [{ allowed: true }, { allowed: true }] },
  ]) {
    const store = createPostgresReadGrantStore({ query: async () => value });
    await assert.rejects(store.hasReadGrant(exact), /read denied/);
  }
  const failed = createPostgresReadGrantStore({ query: async () => { throw Error('network offline'); } });
  await assert.rejects(failed.hasReadGrant(exact), /read denied/);
  let signal;
  const timed = createPostgresReadGrantStore({
    timeoutMs: 50,
    query: (_, __, opts) => { signal = opts.signal; return new Promise(() => {}); },
  });
  await assert.rejects(timed.hasReadGrant(exact), /read denied/);
  assert.equal(signal.aborted, true);
  assert.throws(() => createPostgresReadGrantStore({ query: async () => ({}), timeoutMs: 0 }), /read denied/);
});
