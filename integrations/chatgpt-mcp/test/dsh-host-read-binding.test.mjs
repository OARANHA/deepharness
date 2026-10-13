import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshHostReadBinding } from '../adapters/dsh-host-read-binding.mjs';
import { projectionFixture } from './projection-fixture.mjs';

const target = { workspaceId: 'ws', leadSessionId: 'lead' };
function host() {
  const session = { id: 'lead' };
  let reads = 0;
  const ctx = {
    workspaceRegistry: { get: id => id === 'ws' ? { id: 'ws', sessionIds: ['lead'] } : undefined },
    sessions: { get: id => id === 'lead' ? session : undefined },
    sessionProjections: projectionFixture({ read: () => {
      reads++;
      return { members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [] };
    } }),
  };
  const policy = {
    currentCredential: () => ({ authMode: 'token', authToken: '0123456789abcdef0123456789abcdef', principalId: 'bridge' }),
    grants: [{ principalId: 'bridge', ...target }],
    allowedOrigins: ['https://client.example'],
  };
  return { ctx, policy, reads: () => reads };
}
const request = { headers: { origin: 'https://client.example', authorization: 'Bearer 0123456789abcdef0123456789abcdef' } };

test('official service shapes: authorized exact Team read', async () => {
  const h = host();
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  const model = await binding.runHttpRequest(request, () => binding.readTeam(target));
  assert.equal(model.leadSessionId, 'lead');
  assert.equal(h.reads(), 1);
});

test('unknown workspace and wrong Lead never project', async () => {
  const h = host();
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  await assert.rejects(binding.runHttpRequest(request, () =>
    binding.readTeam({ ...target, leadSessionId: 'unknown' })), /denied/);
  assert.equal(h.reads(), 0);
});

test('replaced host services or stale session fail closed', async () => {
  const h = host();
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  h.ctx.sessions = { get: () => ({ id: 'lead' }) };
  await assert.rejects(binding.runHttpRequest(request, () => binding.readTeam(target)), /denied/);
  assert.equal(h.reads(), 0);
});

test('missing host services fail closed', () => {
  assert.throws(() => createDshHostReadBinding({}, {}), /denied/);
});
