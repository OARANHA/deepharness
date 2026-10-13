import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';

const team = { members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [] };
const session = { id: 'lead' };
const headers = token => ({ authorization: 'Bearer ' + token, origin: 'https://client.example' });

test('verified transport principal gates Lead reads independently from tool claims', async () => {
  const principals = new Map([['a', { principalId: 'alice', kind: 'individual' }],
    ['b', { principalId: 'bob', kind: 'individual' }]]);
  const auth = async request => {
    const bearer = /^Bearer (a|b)$/.exec(request.headers.authorization ?? '');
    if (!bearer) throw new Error('unauthenticated');
    return principals.get(bearer[1]);
  };
  const binding = createMcpReadRequestContext({
    authenticateTransport: auth, allowedOrigins: ['https://client.example'],
    grants: [{ principalId: 'alice', workspaceId: 'ws', leadSessionId: 'lead' }],
    workspaceRegistry: { get: id => id === 'ws' ? { id: 'ws', sessionIds: ['lead'] } : undefined },
    sessionProjections: { snapshot: () => ({ values: { agentTeam: team } }) },
    resolveLiveLeadSession: async id => id === 'lead' ? session : undefined,
  });
  const target = { workspaceId: 'ws', leadSessionId: 'lead' };
  const read = (token, args = target) => binding.runHttpRequest({ headers: headers(token) },
    () => binding.readTeam(args));
  assert.equal((await read('a')).leadSessionId, 'lead');
  await assert.rejects(read('b'), /denied/);
  await assert.rejects(read('b', { ...target, principalId: 'alice' }), /denied/);
  await assert.rejects(read('a', { ...target, workspaceId: 'other' }), /denied/);
  await assert.rejects(binding.runHttpRequest({ headers: headers('invalid') }, () => binding.readTeam(target)), /denied/);
  await assert.rejects(binding.runHttpRequest({ headers: { ...headers('a'), origin: 'https://evil.example' } },
    () => binding.readTeam(target)), /denied/);
  await assert.rejects(binding.readTeam(target), /denied/);

  await assert.rejects(binding.runHttpRequest({ headers: headers('a') }, async () => {
    principals.set('a', { principalId: 'bob', kind: 'individual' });
    return binding.readTeam(target);
  }), /denied/);
  principals.set('a', { principalId: 'alice', kind: 'individual' });
  await assert.rejects(binding.runHttpRequest({ headers: headers('a') }, async () => {
    principals.set('a', { principalId: 'alice', kind: 'service' });
    return binding.readTeam(target);
  }), /denied/);
  principals.set('a', { principalId: 'alice', kind: 'individual' });
  binding.revokeGrant({ principalId: 'alice', ...target });
  await assert.rejects(read('a'), /denied/);
});

test('untrusted or malformed transport resolvers deny rather than fall back', async () => {
  assert.throws(() => createMcpReadRequestContext({ authenticateTransport: true }), /denied/);
  for (const identity of [null, { principalId: 'alice' }, { principalId: '', kind: 'individual' },
    { principalId: 'alice', kind: 'admin' }]) {
    const binding = createMcpReadRequestContext({
      authenticateTransport: async () => identity, allowedOrigins: ['https://client.example'],
    });
    await assert.rejects(binding.runHttpRequest({ headers: headers('a') }, async () => {}), /denied/);
  }
});
