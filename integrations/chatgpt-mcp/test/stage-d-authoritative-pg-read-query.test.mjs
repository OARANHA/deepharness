import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthoritativePgReadQuery, READ_GRANT_SQL, READ_REVOCATION_SQL,
} from '../adapters/authoritative-pg-read-query.mjs';

const SHA = 'a'.repeat(64);
const validRow = () => ({
  role: 'dsh_mcp_reader', database_name: 'dsh_mcp_grants', replica: false,
  default_read_only: 'on', transaction_read_only: 'on',
  statement_timeout: '300ms', grants_read: true, revocations_read: true,
  grants_write: false, revocations_write: false, schema_create: false,
});
function mockPool(row = validRow(), query = async () => ({ rows: [{ allowed: true }] })) {
  const records = [], releases = [];
  let checkouts = 0;
  const pool = {
    connect: async () => {
      checkouts++;
      return {
        query: async (sql, params) => {
          records.push({ sql, params });
          if (sql.startsWith('SELECT\n')) return { rows: [{ ...row }] };
          return query(sql, params);
        },
        release: discard => { releases.push(discard); },
      };
    },
  };
  return { pool, records, releases, checkouts: () => checkouts };
}
const opts = () => ({ readFromPrimary: true, signal: new AbortController().signal });

test('only exact hashed parameterized reads allowed; no revoke INSERT via reader', async () => {
  const m = mockPool();
  const run = createAuthoritativePgReadQuery({ pool: m.pool });
  for (const sql of [READ_GRANT_SQL, READ_REVOCATION_SQL]) {
    assert.deepEqual(await run(sql, [SHA], opts()), { rows: [{ allowed: true }] });
  }
  assert.equal(m.checkouts(), 2);
  assert.equal(m.records.length, 4);
  assert.deepEqual(m.releases, [false, false]);
  for (const [sql, params, options] of [
    ['INSERT INTO chatgpt_mcp_token_revocations VALUES ($1,TRUE)', [SHA], opts()],
    ['SELECT * FROM chatgpt_mcp_read_grants', [SHA], opts()],
    [READ_GRANT_SQL, ['*'], opts()],
    [READ_GRANT_SQL, [SHA, SHA], opts()],
    [READ_GRANT_SQL, [SHA], { readFromPrimary: true }],
    [READ_GRANT_SQL, [SHA], { readFromPrimary: false, signal: new AbortController().signal }],
    [READ_GRANT_SQL, [SHA], { ...opts(), extra: 1 }],
  ]) await assert.rejects(run(sql, params, options), /Agent Teams read denied/);
  assert.equal(m.checkouts(), 2, 'invalid inputs rejected before checkout');
});

test('every checkout rejects wrong role, replica, privileges or insufficient server timeout', async () => {
  for (const field of ['role', 'database_name', 'replica', 'default_read_only',
    'transaction_read_only', 'grants_read', 'revocations_read',
    'grants_write', 'revocations_write', 'schema_create', 'statement_timeout']) {
    const values = {
      role: 'different', database_name: 'other', replica: true,
      default_read_only: 'off', transaction_read_only: 'off',
      grants_read: false, revocations_read: false,
      grants_write: true, revocations_write: true, schema_create: true,
      statement_timeout: '1500ms',
    };
    const m = mockPool({ ...validRow(), [field]: values[field] });
    await assert.rejects(createAuthoritativePgReadQuery({ pool: m.pool })(
      READ_GRANT_SQL, [SHA], opts()), /Agent Teams read denied/);
    assert.equal(m.records.length, 1, 'no protected SELECT may execute');
    assert.deepEqual(m.releases, [true]);
  }
  for (const timeout of ['0', '1s', '5min', '']) {
    const m = mockPool({ ...validRow(), statement_timeout: timeout });
    await assert.rejects(createAuthoritativePgReadQuery({ pool: m.pool })(
      READ_GRANT_SQL, [SHA], opts()), /Agent Teams read denied/);
  }
});

test('SQL errors, ambiguous rows and already aborted requests deny and discard', async () => {
  for (const response of [{}, { rows: [{ allowed: true }, { allowed: true }] }]) {
    const m = mockPool(validRow(), async () => response);
    await assert.rejects(createAuthoritativePgReadQuery({ pool: m.pool })(
      READ_GRANT_SQL, [SHA], opts()), /Agent Teams read denied/);
    assert.deepEqual(m.releases, [true]);
  }
  const broken = mockPool(validRow(), async () => { throw Error('SQLSTATE 57014'); });
  await assert.rejects(createAuthoritativePgReadQuery({ pool: broken.pool })(
    READ_GRANT_SQL, [SHA], opts()), /Agent Teams read denied/);
  assert.deepEqual(broken.releases, [true]);
  const ctrl = new AbortController();
  ctrl.abort();
  const m = mockPool();
  await assert.rejects(createAuthoritativePgReadQuery({ pool: m.pool })(
    READ_GRANT_SQL, [SHA], { readFromPrimary: true, signal: ctrl.signal }),
  /Agent Teams read denied/);
  assert.equal(m.checkouts(), 0);
});

test('abort during an in-flight query never returns late allowance or reuses client', async () => {
  let finish, started;
  const pending = new Promise(resolve => { finish = resolve; });
  const queryStarted = new Promise(resolve => { started = resolve; });
  const m = mockPool(validRow(), async () => { started(); return pending; });
  const ctrl = new AbortController();
  const run = createAuthoritativePgReadQuery({ pool: m.pool });
  const attempt = run(READ_GRANT_SQL, [SHA], { readFromPrimary: true, signal: ctrl.signal });
  await queryStarted;
  ctrl.abort();
  assert.equal(m.releases.length, 0, 'client must remain held during pending SQL');
  finish({ rows: [{ allowed: true }] });
  await assert.rejects(attempt, /Agent Teams read denied/);
  assert.deepEqual(m.releases, [true]);
});

test('changed authority on the next checkout denies even after an earlier allow', async () => {
  const row = validRow();
  const m = mockPool(row);
  const run = createAuthoritativePgReadQuery({ pool: m.pool });
  assert.equal((await run(READ_GRANT_SQL, [SHA], opts())).rows[0].allowed, true);
  row.role = 'different';
  await assert.rejects(run(READ_GRANT_SQL, [SHA], opts()), /Agent Teams read denied/);
  assert.deepEqual(m.releases, [false, true]);
});
