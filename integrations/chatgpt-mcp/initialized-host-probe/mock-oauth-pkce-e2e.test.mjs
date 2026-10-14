import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createMcpOAuthHttpGate } from '../adapters/mcp-oauth-http-gate.mjs';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';

const issuer = 'https://identity.example', resource = 'https://mcp.example/mcp';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 2000000000;
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const hash = s => createHash('sha256').update(s).digest('base64url');
const signAccess = sub => {
  const head = encode({ alg: 'RS256', typ: 'JWT', kid: 'mock-key' });
  const body = encode({ iss: issuer, aud: resource, sub, jti: randomBytes(12).toString('hex'),
    iat: now - 5, nbf: now - 5, exp: now + 120, token_use: 'access' });
  const input = head + '.' + body;
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
};
test('mock OAuth authorization code + PKCE S256 -> JWT -> exact MCP Agent Team grants', { timeout: 12000 }, async t => {
  const codes = new Map(), revoked = new Set();
  const provider = createServer(async (req, res) => {
    const uri = new URL(req.url, 'http://localhost');
    if (uri.pathname === '/authorize') {
      if (uri.searchParams.get('response_type') !== 'code' ||
          uri.searchParams.get('code_challenge_method') !== 'S256' ||
          uri.searchParams.get('resource') !== resource ||
          uri.searchParams.get('scope') !== 'agent-teams:read') { res.writeHead(400).end(); return; }
      const challenge = uri.searchParams.get('code_challenge');
      if (!/^[A-Za-z0-9_-]{43}$/.test(challenge ?? '')) { res.writeHead(400).end(); return; }
      const code = randomBytes(16).toString('base64url');
      codes.set(code, { challenge, state: uri.searchParams.get('state') });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ code, state: uri.searchParams.get('state') }));
      return;
    }
    if (uri.pathname === '/token' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const params = new URLSearchParams(Buffer.concat(chunks).toString());
      const entry = codes.get(params.get('code'));
      if (!entry || params.get('grant_type') !== 'authorization_code' ||
          params.get('resource') !== resource || hash(params.get('code_verifier') ?? '') !== entry.challenge) {
        res.writeHead(400).end(); return;
      }
      codes.delete(params.get('code'));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        .end(JSON.stringify({ access_token: signAccess('alice'), token_type: 'Bearer' }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(ok => provider.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => provider.close(ok)));
  const providerUrl = 'http://127.0.0.1:' + provider.address().port;
  const authenticateTransport = createPinnedJwtTransportAuthenticator({
    issuer, audience: resource,
    publicKeys: { 'mock-key': { ...publicKey.export({ format: 'jwk' }), alg: 'RS256' } },
    isRevoked: async ({ tokenId }) => revoked.has(tokenId), now: () => now,
  });
  const target = { workspaceId: 'ws-1', leadSessionId: 'lead-1' };
  const binding = createMcpReadRequestContext({
    authenticateTransport, allowMissingOrigin: true,
    grants: [{ principalId: issuer + '#alice', ...target }],
    workspaceRegistry: { get: id => id === target.workspaceId ?
      { id, sessionIds: [target.leadSessionId] } : undefined },
    resolveLiveLeadSession: async id => id === target.leadSessionId ? { id } : undefined,
    sessionProjections: { snapshot: () => ({ values: { agentTeam: {
      members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [],
    } } }) },
  });
  const gate = createMcpOAuthHttpGate({
    issuer, resource,
    authenticateTransport: async req => authenticateTransport({ headers: { authorization: req.headers.authorization } }),
  });
  const mcp = createServer((req, res) => gate.handle(req, res, async () => {
    try {
      const payload = await binding.runHttpRequest(req, () => binding.readTeam(target));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
    } catch { res.writeHead(403).end('denied'); }
  }).catch(() => res.writeHead(500).end()));
  await new Promise(ok => mcp.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => mcp.close(ok)));
  const mcpUrl = 'http://127.0.0.1:' + mcp.address().port;
  const unauth = await fetch(mcpUrl + '/mcp');
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('www-authenticate'), /resource_metadata=/);
  const metadata = await (await fetch(mcpUrl + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(16).toString('hex');
  const authorize = new URL(providerUrl + '/authorize');
  for (const [key, value] of Object.entries({ response_type: 'code', code_challenge_method: 'S256',
    code_challenge: hash(verifier), state, resource, scope: 'agent-teams:read' })) authorize.searchParams.set(key, value);
  const grant = await (await fetch(authorize)).json();
  assert.equal(grant.state, state);
  const badExchange = await fetch(providerUrl + '/token', { method: 'POST',
    body: new URLSearchParams({ code: grant.code, code_verifier: 'wrong',
      grant_type: 'authorization_code', resource }) });
  assert.equal(badExchange.status, 400);
  const exchange = await fetch(providerUrl + '/token', { method: 'POST',
    body: new URLSearchParams({ code: grant.code, code_verifier: verifier,
      grant_type: 'authorization_code', resource }) });
  assert.equal(exchange.status, 200);
  const { access_token } = await exchange.json();
  assert.equal((await fetch(providerUrl + '/token', { method: 'POST',
    body: new URLSearchParams({ code: grant.code, code_verifier: verifier,
      grant_type: 'authorization_code', resource }) })).status, 400, 'authorization code is one-use');
  const headers = { authorization: 'Bearer ' + access_token };
  assert.equal((await fetch(mcpUrl + '/mcp', { headers })).status, 200);
  await assert.rejects(binding.runHttpRequest({ headers }, () =>
    binding.readTeam({ workspaceId: 'ws-other', leadSessionId: 'lead-1' })), /denied/);
  const claims = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64url'));
  revoked.add(claims.jti);
  assert.equal((await fetch(mcpUrl + '/mcp', { headers })).status, 401);
});
