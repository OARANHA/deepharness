import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedMcpReadIdentity } from '../adapters/scoped-mcp-read-identity.mjs';

function setup() {
  const authenticated = new WeakMap();
  const request = {};
  authenticated.set(request, { principalId: 'bridge-service', kind: 'service' });
  let granted = true;
  let reads = 0;
  let projection = { members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] };
  const read = createScopedMcpReadIdentity({
    authenticateRequest: async req => authenticated.get(req),
    hasReadGrant: async scope => granted && scope.principalId === 'bridge-service' &&
      scope.workspaceId === 'ws' && scope.leadSessionId === 'lead',
    workspaceRegistry: { get: id => ({ id, sessionIds: ['lead', 'other'] }) },
    resolveLiveLeadSession: async id => ({ id }),
    sessionProjections: { stateOf: () => { reads++; return projection; } },
  });
  return { read, request, authenticated, reads: () => reads,
    revoke: () => { granted = false; }, defer: value => { projection = value; } };
}
const target = { workspaceId: 'ws', leadSessionId: 'lead' };

test('authenticated service receives only its explicit workspace/Lead grant', async () => {
  const h = setup();
  assert.equal((await h.read(target, h.request)).leadSessionId, 'lead');
  assert.equal(h.reads(), 1);
});
for (const [name, args, request] of [
  ['missing identity', target, {}],
  ['invalid token', target, { headers: { authorization: 'Bearer invalid' } }],
  ['forged identity', { ...target, principalId: 'bridge-service', canRead: true }, { principalId: 'bridge-service' }],
  ['wrong workspace', { ...target, workspaceId: 'other' }],
  ['unauthorized Lead', { ...target, leadSessionId: 'other' }],
]) test(name + ' denies without projection access', async () => {
  const h = setup();
  await assert.rejects(h.read(args, request ?? h.request), /read denied/);
  assert.equal(h.reads(), 0);
});
for (const mode of ['grant', 'authentication', 'principal']) test(mode + ' revocation during projection denies output', async () => {
  const h = setup();
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  h.defer({ then(resolve) { release = resolve; started(); } });
  const attempt = h.read(target, h.request);
  await entered;
  if (mode === 'grant') h.revoke();
  if (mode === 'authentication') h.authenticated.delete(h.request);
  if (mode === 'principal') h.authenticated.set(h.request, { principalId: 'other', kind: 'service' });
  release({ members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(attempt, /read denied/);
});
test('missing trusted authentication or grant service fails closed', () => {
  assert.throws(() => createScopedMcpReadIdentity({}), /read denied/);
});
