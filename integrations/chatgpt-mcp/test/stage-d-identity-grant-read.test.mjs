import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createScopedMcpReadIdentity } from '../adapters/scoped-mcp-read-identity.mjs';
import { createPostgresReadGrantStore } from '../adapters/postgres-read-grants.mjs';

const exact = Object.freeze({
  principalId: 'https://id.example.test/realms/dsh#individual-1',
  workspaceId: 'workspace-1',
  leadSessionId: 'lead-1',
});
const grantHash = createHash('sha256')
  .update(JSON.stringify([exact.principalId, exact.workspaceId, exact.leadSessionId]))
  .digest('hex');
const target = Object.freeze({ workspaceId: exact.workspaceId, leadSessionId: exact.leadSessionId });
const projection = Object.freeze({
  members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }],
  tasks: [],
});

function harness() {
  const request = Object.freeze({});
  const authenticated = new WeakMap([[request, { principalId: exact.principalId, kind: 'individual' }]]);
  const grants = new Set([grantHash]);
  const workspace = { id: exact.workspaceId, sessionIds: [exact.leadSessionId] };
  const statements = [];
  let projectionReads = 0;
  let sessionReads = 0;
  let projectionOverride;
  let queryOverride;
  const store = createPostgresReadGrantStore({
    query: async (sql, params, opts) => {
      statements.push({ sql, params });
      assert.equal(sql, 'SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = $1');
      assert.equal(params.length, 1);
      assert.match(params[0], /^[a-f0-9]{64}$/);
      assert.equal(opts.readFromPrimary, true);
      assert.ok(opts.signal instanceof AbortSignal);
      if (queryOverride) return queryOverride();
      return { rows: grants.has(params[0]) ? [{ allowed: true }] : [] };
    },
  });
  const read = createScopedMcpReadIdentity({
    authenticateRequest: async incoming => authenticated.get(incoming),
    hasReadGrant: store.hasReadGrant,
    workspaceRegistry: { get: id => id === workspace.id ? workspace : undefined },
    resolveLiveLeadSession: async id => { sessionReads++; return { id }; },
    sessionProjections: {
      snapshot: (_session, keys) => {
        projectionReads++;
        assert.deepEqual(keys, ['agentTeam']);
        return projectionOverride ?? { values: { agentTeam: projection } };
      },
    },
  });
  return {
    request, read, authenticated, grants, workspace, statements,
    projectionReads: () => projectionReads,
    sessionReads: () => sessionReads,
    setProjection: value => { projectionOverride = value; },
    setQuery: value => { queryOverride = value; },
  };
}

test('verified individual can only read the exact granted workspace and Lead', async () => {
  const h = harness();
  const result = await h.read({
    ...target, principalId: 'forged-identity', kind: 'service', canReadTeamProjection: true,
  }, h.request);
  assert.equal(result.leadSessionId, exact.leadSessionId);
  assert.deepEqual(result.members, projection.members);
  assert.equal(h.projectionReads(), 1);
  assert.ok(h.statements.length >= 3, 'authorization must recheck persistent grants across awaits');
  assert.ok(h.statements.every(entry => entry.params[0] === grantHash));
});

test('missing transport identity and other workspace/Lead cannot read a projection', async () => {
  for (const [args, request] of [
    [target, {}],
    [{ ...target, workspaceId: 'workspace-2' }, undefined],
    [{ ...target, leadSessionId: 'lead-2' }, undefined],
    [{ ...target, leadSessionId: '*' }, undefined],
  ]) {
    const h = harness();
    await assert.rejects(h.read(args, request ?? h.request), /Agent Teams read denied/);
    assert.equal(h.sessionReads(), 0);
    assert.equal(h.projectionReads(), 0);
    assert.equal(h.statements.length, 0);
  }
});

test('tool-supplied principal cannot replace transport-authenticated principal', async () => {
  const h = harness();
  h.authenticated.set(h.request, { principalId: 'other-individual', kind: 'individual' });
  await assert.rejects(h.read({ ...target, principalId: exact.principalId }, h.request),
    /Agent Teams read denied/);
  assert.ok(h.statements.length > 0);
  assert.ok(h.statements.every(entry => entry.params[0] !== grantHash));
  assert.equal(h.projectionReads(), 0);
});

for (const mode of ['grant-revoked', 'identity-revoked', 'principal-switched', 'kind-switched', 'Lead-detached']) {
  test(mode + ' while awaiting projection denies before returning data', async () => {
    const h = harness();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.setProjection(pending);
    const attempt = h.read(target, h.request);
    // Wait only for the in-memory projection boundary, never for external services.
    for (let i = 0; i < 30 && h.projectionReads() === 0; i++) await Promise.resolve();
    assert.equal(h.projectionReads(), 1, 'the first authorized read must reach the projection');
    if (mode === 'grant-revoked') h.grants.delete(grantHash);
    if (mode === 'identity-revoked') h.authenticated.delete(h.request);
    if (mode === 'principal-switched') h.authenticated.set(h.request, { principalId: 'other', kind: 'individual' });
    if (mode === 'kind-switched') h.authenticated.set(h.request, { principalId: exact.principalId, kind: 'service' });
    if (mode === 'Lead-detached') h.workspace.sessionIds = [];
    release({ values: { agentTeam: projection } });
    await assert.rejects(attempt, /Agent Teams read denied/);
    assert.equal(h.projectionReads(), 1);
  });
}

test('authoritative database failure, missing row and ambiguous row deny before projection', async () => {
  for (const response of [
    () => { throw Error('db unreachable'); },
    () => ({ rows: [] }),
    () => ({ rows: [{ allowed: 'true' }] }),
    () => ({ rows: [{ allowed: true }, { allowed: true }] }),
  ]) {
    const h = harness();
    h.setQuery(response);
    await assert.rejects(h.read(target, h.request), /Agent Teams read denied/);
    assert.equal(h.projectionReads(), 0);
    assert.equal(h.sessionReads(), 0);
  }
});
