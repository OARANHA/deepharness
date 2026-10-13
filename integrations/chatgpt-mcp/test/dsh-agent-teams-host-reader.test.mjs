import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshAgentTeamHostReader } from '../adapters/dsh-agent-teams-host-reader.mjs';

function setup() {
  const workspace = { id: 'ws-1', sessionIds: ['lead-1'] };
  const events = [];
  let permitted = true;
  let session = { id: 'lead-1' };
  const reader = createDshAgentTeamHostReader({
    workspaceRegistry: { get: id => { events.push('workspace'); return id === workspace.id ? workspace : undefined; } },
    sessionProjections: { stateOf: (value, key) => {
      events.push('projection');
      assert.equal(value, session);
      assert.equal(key, 'agentTeam');
      return { members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] };
    } },
    resolveLiveLeadSession: async () => { events.push('session'); return session; },
    authorizePrincipal: async ({ principalId }) => {
      events.push('policy');
      return permitted && principalId === 'owner';
    },
    principalFromTransport: async ctx => { events.push('transport'); return ctx.principal; },
  });
  return { reader, workspace, events, deny: () => { permitted = false; }, missing: () => { session = undefined; } };
}
const request = { leadSessionId: 'lead-1', workspaceId: 'ws-1' };

test('uses real DSH service method shapes for authorized read', async () => {
  const h = setup();
  const value = await h.reader(request, { principal: 'owner' });
  assert.equal(value.leadSessionId, 'lead-1');
  assert.deepEqual(h.events, ['transport', 'workspace', 'policy', 'session', 'workspace', 'policy', 'projection']);
});

test('wrong principal cannot trigger session access', async () => {
  const h = setup();
  await assert.rejects(h.reader(request, { principal: 'intruder' }), /read denied/);
  assert.equal(h.events.includes('session'), false);
  assert.equal(h.events.includes('projection'), false);
});

test('detached or unknown workspace never reads session', async () => {
  const h = setup();
  h.workspace.sessionIds = [];
  await assert.rejects(h.reader(request, { principal: 'owner' }), /read denied/);
  assert.equal(h.events.includes('session'), false);
});

test('revocation between admission and read denies projection', async () => {
  const h = setup();
  // Simulate revocation while session resolution was suspended.
  const original = h.reader;
  const p = original(request, { principal: 'owner' });
  h.deny();
  await assert.rejects(p, /read denied/);
  assert.equal(h.events.includes('projection'), false);
});

test('unavailable live session fails closed without cold resume', async () => {
  const h = setup();
  h.missing();
  await assert.rejects(h.reader(request, { principal: 'owner' }), /read denied/);
  assert.equal(h.events.includes('projection'), false);
});

test('rejects missing trusted services', () => {
  assert.throws(() => createDshAgentTeamHostReader({}), /read denied/);
});

test('revocation during projection resolution denies the result', async () => {
  let release;
  let projected = false;
  let authorized = true;
  const pending = new Promise(resolve => { release = resolve; });
  const reader = createDshAgentTeamHostReader({
    workspaceRegistry: { get: () => ({ id: 'ws-1', sessionIds: ['lead-1'] }) },
    sessionProjections: { stateOf: () => { projected = true; return pending; } },
    resolveLiveLeadSession: async () => ({ id: 'lead-1' }),
    authorizePrincipal: async () => authorized,
    principalFromTransport: async () => 'owner',
  });
  const attempt = reader(request, {});
  // Advance through transport, admission and live session lookup.
  for (let i = 0; i < 12 && !projected; i++) await Promise.resolve();
  assert.equal(projected, true);
  authorized = false;
  release({ members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(attempt, /read denied/);
});
