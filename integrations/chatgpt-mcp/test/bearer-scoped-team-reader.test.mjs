import { projectionFixture } from './projection-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createBearerScopedTeamReader } from '../adapters/bearer-scoped-team-reader.mjs';

function setup() {
  let credential = { authMode: 'token', authToken: randomBytes(32).toString('base64url'), principalId: 'bridge' };
  const request = { headers: { authorization: 'Bearer ' + credential.authToken } };
  const grants = new Set(['bridge/ws/lead']);
  let reads = 0;
  let projection = { members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] };
  const read = createBearerScopedTeamReader({
    currentCredential: () => credential,
    hasReadGrant: ({ principalId, workspaceId, leadSessionId }) => grants.has([principalId, workspaceId, leadSessionId].join('/')),
    workspaceRegistry: { get: id => ({ id, sessionIds: ['lead', 'other'] }) },
    resolveLiveLeadSession: async () => ({}),
    sessionProjections: projectionFixture({ read: () => { reads++; return projection; } }),
  });
  return { read, request, grants, reads: () => reads,
    credential: value => { credential = value; }, defer: value => { projection = value; } };
}
const target = { workspaceId: 'ws', leadSessionId: 'lead' };
test('actual Bearer comparison authorizes configured service scope', async () => {
  const h = setup();
  assert.equal((await h.read(target, h.request)).leadSessionId, 'lead');
});
for (const header of [undefined, '', 'Bearer invalid', 'Basic invalid', ['Bearer invalid'], 'Bearer ', 'Bearer invalid\n']) {
  test('rejects malformed or invalid Bearer ' + JSON.stringify(header), async () => {
    const h = setup();
    await assert.rejects(h.read(target, { headers: { authorization: header } }), /read denied/);
    assert.equal(h.reads(), 0);
  });
}
test('authMode none cannot grant scoped reads', async () => {
  const h = setup(); h.credential({ authMode: 'none', principalId: 'bridge', authToken: '' });
  await assert.rejects(h.read(target, h.request), /read denied/);
});
for (const scope of [{ workspaceId: 'other', leadSessionId: 'lead' }, { workspaceId: 'ws', leadSessionId: 'other' }])
  test('Bearer does not grant unauthorized target ' + JSON.stringify(scope), async () => {
    const h = setup();
    await assert.rejects(h.read(scope, h.request), /read denied/);
    assert.equal(h.reads(), 0);
  });
for (const mode of ['token', 'grant']) test(mode + ' revocation during read denies return', async () => {
  const h = setup();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.defer({ then(resolve) { release = resolve; entered(); } });
  const pending = h.read(target, h.request);
  await started;
  if (mode === 'grant') h.grants.clear();
  else h.credential({ authMode: 'token', authToken: randomBytes(32).toString('base64url'), principalId: 'bridge' });
  release({ members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(pending, /read denied/);
});
