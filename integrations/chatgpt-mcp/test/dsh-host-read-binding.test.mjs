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

test('host service replaced during pending projection denies returned data', async () => {
  const h = host();
  let signalEntered;
  let finishProjection;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const pending = new Promise(resolve => { finishProjection = resolve; });
  h.ctx.sessionProjections = projectionFixture({ read: () => {
    signalEntered();
    return pending;
  } });
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  const read = binding.runHttpRequest(request, () => binding.readTeam(target));
  await entered;
  h.ctx.workspaceRegistry = { get: () => ({ id: 'ws', sessionIds: ['lead'] }) };
  finishProjection({ members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(read, /denied/);
});

test('service replacement during admission denies before session projection', async () => {
  const h = host();
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  h.ctx.sessionProjections = projectionFixture({ read: () => { throw new Error('must not project'); } });
  await assert.rejects(binding.runHttpRequest(request, () => binding.readTeam(target)), /denied/);
  assert.equal(h.reads(), 0);
});

test('session handle swapped while snapshot is pending denies stale Team', async () => {
  const h = host();
  const original = h.ctx.sessions.get('lead');
  let entered, complete;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { complete = resolve; });
  let live = original;
  h.ctx.sessions.get = id => id === 'lead' ? live : undefined;
  h.ctx.sessionProjections = projectionFixture({ read: () => {
    entered();
    return pending;
  } });
  const binding = createDshHostReadBinding(h.ctx, h.policy);
  const read = binding.runHttpRequest(request, () => binding.readTeam(target));
  await started;
  live = { id: 'lead' };
  complete({ members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(read, /denied/);
});
