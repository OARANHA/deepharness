/** Disposable GitHub Actions PostgreSQL primary only. Never point at production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { createPostgresReadGrantStore } from '../adapters/postgres-read-grants.mjs';
import { createScopedMcpReadIdentity } from '../adapters/scoped-mcp-read-identity.mjs';

const { Pool } = pg;
const deny = () => { throw Error('Agent Teams read denied'); };
if (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'OARANHA/deepharness' ||
    !/^[0-9]{1,20}$/.test(process.env.TEST_POSTGRES_PASSWORD ?? '')) {
  throw Error('Disposable GitHub Actions PostgreSQL only');
}
assert.equal(createRequire(import.meta.url)('pg/package.json').version, '8.16.3');

const readerRole = 'dsh_stage_d_ci_reader';
const dbName = 'stage_d_test';
const adminOptions = {
  host: '127.0.0.1', port: 5432, database: dbName,
  user: 'integration', password: process.env.TEST_POSTGRES_PASSWORD,
  connectionTimeoutMillis: 2000, max: 2,
};
const scope = Object.freeze({
  principalId: 'https://id.example.test/realms/dsh#human-1',
  workspaceId: 'workspace-1',
  leadSessionId: 'lead-1',
});
const hash = createHash('sha256').update(JSON.stringify(Object.values(scope))).digest('hex');
const grantSQL = 'SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = $1';
const projection = {
  members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }],
  tasks: [],
};

async function verifyClient(client) {
  const { rows } = await client.query(`
    SELECT current_user AS role, current_database() AS database_name,
      pg_is_in_recovery() AS replica,
      current_setting('default_transaction_read_only') AS read_only,
      current_setting('statement_timeout') AS deadline,
      has_table_privilege(current_user, 'public.chatgpt_mcp_read_grants', 'SELECT') AS can_read,
      has_table_privilege(current_user, 'public.chatgpt_mcp_read_grants', 'INSERT') AS can_write,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create
  `);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    role: readerRole, database_name: dbName, replica: false,
    read_only: 'on', deadline: '300ms',
    can_read: true, can_write: false, can_create: false,
  });
}

// Test-only host bridge: the real deploy/mcp/operational-host.mjs bridge remains
// unmodified and is NOT validated by this positive integration seam.
function createInspectedQuery(pool) {
  return async (sql, params, options) => {
    if (sql !== grantSQL || !Array.isArray(params) || params.length !== 1 ||
        !/^[0-9a-f]{64}$/.test(params[0]) ||
        options?.readFromPrimary !== true ||
        !(options.signal instanceof AbortSignal) || options.signal.aborted) deny();
    const client = await pool.connect();
    try {
      await verifyClient(client); // Authority and deadline on THIS checkout.
      if (options.signal.aborted) deny();
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  };
}

test('pg@8.16.3 actual disposable primary, authority, cancellation and grants', async t => {
  const admin = new Pool(adminOptions);
  const password = randomBytes(24).toString('hex'); // Ephemeral, never committed.
  let reader;
  try {
    await admin.query(`CREATE TABLE public.chatgpt_mcp_read_grants
      (grant_hash CHAR(64) PRIMARY KEY, allowed BOOLEAN NOT NULL)`);
    await admin.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await admin.query(`CREATE ROLE ${readerRole} LOGIN PASSWORD '${password}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await admin.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${readerRole}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${readerRole}`);
    await admin.query(`GRANT SELECT ON public.chatgpt_mcp_read_grants TO ${readerRole}`);
    await admin.query(`ALTER ROLE ${readerRole} SET default_transaction_read_only=on`);
    await admin.query(`ALTER ROLE ${readerRole} SET statement_timeout='300ms'`);
    await admin.query('INSERT INTO public.chatgpt_mcp_read_grants VALUES ($1, TRUE)', [hash]);

    const readerOptions = {
      ...adminOptions, user: readerRole, password,
      max: 2, statement_timeout: 300,
    };
    reader = new Pool(readerOptions);
    const query = createInspectedQuery(reader);
    const grants = createPostgresReadGrantStore({ query, timeoutMs: 1200 });

    await t.test('each checkout has primary/read-only identity and effective GUCs', async () => {
      const a = await reader.connect();
      const b = await reader.connect();
      try {
        await verifyClient(a);
        await verifyClient(b);
        await assert.rejects(a.query('INSERT INTO public.chatgpt_mcp_read_grants VALUES ($1,TRUE)',
          ['a'.repeat(64)]), error => ['25006', '42501'].includes(error?.code));
        await verifyClient(a);
      } finally { b.release(); a.release(); }
    });

    await t.test('exact grant, revoked/absent grant and different scope fail closed', async () => {
      assert.equal(await grants.hasReadGrant(scope), true);
      assert.equal(await grants.hasReadGrant({ ...scope, workspaceId: 'other' }), false);
      await admin.query('UPDATE public.chatgpt_mcp_read_grants SET allowed=FALSE WHERE grant_hash=$1', [hash]);
      assert.equal(await grants.hasReadGrant(scope), false);
      await admin.query('DELETE FROM public.chatgpt_mcp_read_grants WHERE grant_hash=$1', [hash]);
      assert.equal(await grants.hasReadGrant(scope), false);
      await admin.query('INSERT INTO public.chatgpt_mcp_read_grants VALUES ($1,TRUE)', [hash]);
    });

    await t.test('PostgreSQL statement_timeout really cancels on server and client is reusable', async () => {
      const client = await reader.connect();
      try {
        await verifyClient(client);
        const before = await client.query('SELECT pg_backend_pid() AS pid');
        await assert.rejects(client.query('SELECT pg_sleep(1.5)'), e =>
          e?.code === '57014' && /statement timeout/i.test(e.message));
        const after = await client.query('SELECT pg_backend_pid() AS pid, 42 AS value');
        assert.equal(after.rows[0].pid, before.rows[0].pid);
        assert.equal(after.rows[0].value, 42);
        await verifyClient(client);
      } finally { client.release(); }
    });

    await t.test('real DB revocation across async host resolution denies projection', async () => {
      const request = Object.freeze({ headers: { authorization: 'Bearer test-not-real' } });
      let projected = 0;
      const read = createScopedMcpReadIdentity({
        authenticateRequest: async incoming =>
          incoming === request ? { principalId: scope.principalId, kind: 'individual' } : undefined,
        hasReadGrant: grants.hasReadGrant,
        workspaceRegistry: { get: id =>
          id === scope.workspaceId ? { id, sessionIds: [scope.leadSessionId] } : undefined },
        resolveLiveLeadSession: async () => {
          await admin.query('UPDATE public.chatgpt_mcp_read_grants SET allowed=FALSE WHERE grant_hash=$1', [hash]);
          return { id: scope.leadSessionId };
        },
        sessionProjections: { snapshot: () => { projected++; return { values: { agentTeam: projection } }; } },
      });
      await assert.rejects(read({
        workspaceId: scope.workspaceId, leadSessionId: scope.leadSessionId,
      }, request), /Agent Teams read denied/);
      assert.equal(projected, 0);
      assert.equal(await grants.hasReadGrant(scope), false);
    });

    await t.test('wrong role and lost primary-intent contract cannot return an allowed result', async () => {
      await assert.rejects(createInspectedQuery(admin)(grantSQL, [hash], {
        readFromPrimary: true, signal: new AbortController().signal,
      }));
      await assert.rejects(query(grantSQL, [hash], {
        signal: new AbortController().signal,
      }), /Agent Teams read denied/);
      await assert.rejects(query('SELECT allowed FROM wrong_table WHERE grant_hash=$1', [hash], {
        readFromPrimary: true, signal: new AbortController().signal,
      }), /Agent Teams read denied/);
    });

    await t.test('pool reconnect re-establishes authority and cannot return a stale grant', async () => {
      await reader.end();
      reader = null;
      const next = new Pool(readerOptions);
      reader = next;
      const second = createPostgresReadGrantStore({
        query: createInspectedQuery(next), timeoutMs: 1200,
      });
      assert.equal(await second.hasReadGrant(scope), false);
    });
  } finally {
    if (reader) await reader.end();
    await admin.end();
  }
});
