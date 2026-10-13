import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';

function setup() {
  const token = randomBytes(32).toString('base64url');
  let reads = 0;
  const binding = createMcpReadRequestContext({
    currentCredential: () => ({ authMode: 'token', authToken: token, principalId: 'bridge' }),
    grants: [{ principalId: 'bridge', workspaceId: 'ws', leadSessionId: 'lead' }],
    allowedOrigins: ['https://client.example'],
    allowMissingOrigin: false,
    workspaceRegistry: { get: () => ({ id: 'ws', sessionIds: ['lead'] }) },
    resolveLiveLeadSession: async () => ({}),
    sessionProjections: { stateOf: () => {
      reads++;
      return { members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] };
    } },
  });
  const request = { headers: { authorization: 'Bearer ' + token, origin: 'https://client.example' } };
  return { binding, request, reads: () => reads };
}
const target = { workspaceId: 'ws', leadSessionId: 'lead' };
test('callback uses server request context and ignores forged claims', async () => {
  const h = setup();
  const result = await h.binding.runHttpRequest(h.request, () =>
    h.binding.readTeam({ ...target, principalId: 'attacker', canRead: true, transport: {} }));
  assert.equal(result.leadSessionId, 'lead');
});
test('calls without request context deny even with forged request arguments', async () => {
  const h = setup();
  await assert.rejects(h.binding.readTeam({ ...target, request: h.request }), /read denied/);
  assert.equal(h.reads(), 0);
});
for (const headers of [
  { origin: 'https://client.example' },
  { authorization: 'Bearer invalid', origin: 'https://client.example' },
  { origin: 'https://evil.example' },
  { origin: 'null' },
  {},
]) test('invalid Bearer or origin rejects dispatch ' + JSON.stringify(headers), async () => {
  const h = setup();
  let dispatched = false;
  await assert.rejects(h.binding.runHttpRequest({ headers }, () => { dispatched = true; }), /read denied/);
  assert.equal(dispatched, false);
});
test('valid Bearer still rejects unapproved or absent origin', async () => {
  const h = setup();
  for (const origin of [undefined, 'null', 'https://evil.example', ['https://client.example']]) {
    await assert.rejects(h.binding.runHttpRequest({ headers: { ...h.request.headers, origin } }, () =>
      h.binding.readTeam(target)), /read denied/);
  }
});
test('concurrent requests cannot inherit another request authority', async () => {
  const h = setup();
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const valid = h.binding.runHttpRequest(h.request, async () => { entered(); await wait; return h.binding.readTeam(target); });
  await ready;
  await assert.rejects(h.binding.runHttpRequest({ headers: { origin: 'https://client.example' } }, () =>
    h.binding.readTeam(target)), /read denied/);
  release();
  assert.equal((await valid).leadSessionId, 'lead');
});
test('expired asynchronous context cannot be reused after dispatch completes', async () => {
  const h = setup();
  let deferred, release;
  const wait = new Promise(resolve => { release = resolve; });
  await h.binding.runHttpRequest(h.request, () => {
    deferred = wait.then(() => h.binding.readTeam(target));
  });
  release();
  await assert.rejects(deferred, /read denied/);
});
test('server-owned grant revocation denies callback', async () => {
  const h = setup();
  h.binding.revokeGrant({ principalId: 'bridge', ...target });
  await assert.rejects(h.binding.runHttpRequest(h.request, () => h.binding.readTeam(target)), /read denied/);
});

test('real loopback HTTP requests reach the callback only after Bearer/origin admission', async t => {
  const { createServer } = await import('node:http');
  const h = setup();
  const server = createServer(async (req, res) => {
    try {
      const result = await h.binding.runHttpRequest(req, () => h.binding.readTeam(target));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 403;
      res.end('denied');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = 'http://127.0.0.1:' + server.address().port;
  const allowed = await fetch(url, { headers: h.request.headers });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).leadSessionId, 'lead');
  const count = h.reads();
  for (const headers of [
    { ...h.request.headers, authorization: 'Bearer invalid' },
    { ...h.request.headers, origin: 'https://evil.example' },
    { origin: 'https://client.example' },
  ]) {
    const denied = await fetch(url, { headers });
    assert.equal(denied.status, 403);
    await denied.text();
  }
  assert.equal(h.reads(), count);
});
