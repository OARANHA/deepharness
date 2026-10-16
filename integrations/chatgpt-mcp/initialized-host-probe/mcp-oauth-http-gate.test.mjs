import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMcpOAuthHttpGate } from '../adapters/mcp-oauth-http-gate.mjs';
const issuer = 'https://login.example', resource = 'https://mcp.example/mcp';
test('HTTP discovery is public, bad bearer gets 401 metadata hint, valid identity dispatches only', async t => {
  const gate = createMcpOAuthHttpGate({ resource, issuer,
    authenticateTransport: async req => {
      if (req.headers.authorization !== 'Bearer valid') throw Error('denied');
      return { principalId: 'https://login.example#alice', kind: 'individual' };
    },
  });
  let dispatched = 0;
  const server = createServer((req, res) => {
    gate.handle(req, res, () => { dispatched++; res.writeHead(200).end('scoped'); })
      .catch(() => res.writeHead(500).end());
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => server.close(ok)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const meta = await fetch(base + '/.well-known/oauth-protected-resource/mcp');
  assert.equal(meta.status, 200);
  const json = await meta.json();
  assert.equal(json.resource, resource);
  assert.deepEqual(json.authorization_servers, [issuer]);
  assert.deepEqual(json.scopes_supported, ['agent-teams:read']);
  assert.equal((await fetch(base + '/mcp')).status, 401);
  const denied = await fetch(base + '/mcp', { headers: { authorization: 'Bearer fake' } });
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /^Bearer resource_metadata="https:\/\/mcp\.example\//);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/mcp', { headers: { authorization: 'Bearer valid' } })).status, 200);
  assert.equal(dispatched, 1);
  assert.equal((await fetch(base + '/not-mcp')).status, 404);
  assert.equal((await fetch(base + '/.well-known/oauth-protected-resource/mcp', { method: 'POST' })).status, 405);
});
test('invalid route, untrusted auth function, resource mismatch fail before mounting', () => {
  assert.throws(() => createMcpOAuthHttpGate({ resource, issuer }), /denied/);
  assert.throws(() => createMcpOAuthHttpGate({
    resource: 'https://mcp.example/other', issuer, authenticateTransport: async () => ({}),
  }), /denied/);
});
