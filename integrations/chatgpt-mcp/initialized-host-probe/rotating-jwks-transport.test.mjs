import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createPinnedOidcDiscovery } from '../adapters/pinned-oidc-discovery.mjs';
import { createRotatingJwksTransportAuthenticator } from '../adapters/rotating-jwks-transport-authenticator.mjs';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';

const issuer = 'https://identity.example', audience = 'deep-mcp';
const discoveryUri = issuer + '/.well-known/openid-configuration', jwksUri = issuer + '/keys';
const discoveryDoc = { issuer, jwks_uri: jwksUri, id_token_signing_alg_values_supported: ['RS256'] };
const first = generateKeyPairSync('rsa', { modulusLength: 2048 });
const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (pair, kid) => ({ ...pair.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = { iss: issuer, aud: audience, sub: 'alice', jti: 'token-1',
  iat: 1999999980, nbf: 1999999980, exp: 2000000100, token_use: 'access' };
function jwt(pair, kid, claim = claims) {
  const input = encode({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + encode(claim);
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url');
}
const request = token => ({ headers: { authorization: 'Bearer ' + token, origin: 'https://client.example' } });
const respond = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
function fixture() {
  let ms = 2000000000000, keys = [jwk(first, 'old')], fail = false;
  const fetcher = async uri => {
    if (fail) throw new Error('upstream JWKS unavailable');
    return respond(uri === discoveryUri ? discoveryDoc : { keys });
  };
  const discovery = createPinnedOidcDiscovery({
    issuer, discoveryUri, jwksUri, fetcher, now: () => ms, ttlMs: 1000,
  });
  const verify = createRotatingJwksTransportAuthenticator({
    discovery, audience, isRevoked: async () => false, now: () => Math.floor(ms / 1000),
  });
  return { discovery, verify,
    setKeys: value => { keys = value; },
    setFail: value => { fail = value; },
    advance: amount => { ms += amount; },
  };
}
test('JWKS rotation removes old kid and rejects tampered or unknown signatures', async () => {
  const f = fixture();
  const oldJwt = jwt(first, 'old'), newJwt = jwt(second, 'new');
  assert.equal((await f.verify(request(oldJwt))).principalId, issuer + '#alice');
  await assert.rejects(f.verify(request(newJwt)), /denied/);
  await assert.rejects(f.verify(request(jwt(second, 'old'))), /denied/);
  f.setKeys([jwk(second, 'new')]);
  await f.discovery.refresh();
  assert.equal((await f.verify(request(newJwt))).principalId, issuer + '#alice');
  await assert.rejects(f.verify(request(oldJwt)), /denied/);
  await assert.rejects(f.verify(request(jwt(first, 'new'))), /denied/);
});
test('same kid new key replaces old key with no stale fallback', async () => {
  const f = fixture();
  const oldJwt = jwt(first, 'old'), replaced = jwt(second, 'old');
  await f.verify(request(oldJwt));
  f.setKeys([jwk(second, 'old')]);
  await f.discovery.refresh();
  await assert.rejects(f.verify(request(oldJwt)), /denied/);
  assert.equal((await f.verify(request(replaced))).principalId, issuer + '#alice');
});
test('failed refresh after expiry rejects previously accepted JWT', async () => {
  const f = fixture(), oldJwt = jwt(first, 'old');
  await f.verify(request(oldJwt));
  f.advance(1001); f.setFail(true);
  await assert.rejects(f.verify(request(oldJwt)), /denied/);
  await assert.rejects(f.verify(request(oldJwt)), /denied/);
});
test('rotating identity cannot continue an MCP read after key removal', async () => {
  const f = fixture(), oldJwt = jwt(first, 'old');
  const target = { workspaceId: 'ws', leadSessionId: 'lead' };
  const binding = createMcpReadRequestContext({
    authenticateTransport: f.verify, allowedOrigins: ['https://client.example'],
    grants: [{ principalId: issuer + '#alice', ...target }],
    workspaceRegistry: { get: id => id === 'ws' ? { id: 'ws', sessionIds: ['lead'] } : undefined },
    resolveLiveLeadSession: async id => id === 'lead' ? { id: 'lead' } : undefined,
    sessionProjections: { snapshot: () => ({ values: { agentTeam: {
      members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [],
    } } }) },
  });
  assert.equal((await binding.runHttpRequest(request(oldJwt), () => binding.readTeam(target))).leadSessionId, 'lead');
  await assert.rejects(binding.runHttpRequest(request(oldJwt), async () => {
    f.setKeys([jwk(second, 'new')]);
    await f.discovery.refresh();
    return binding.readTeam(target);
  }), /denied/);
});

test('rotating JWKS verifier enforces required OAuth access-token scope on signed JWTs', async () => {
  const f = fixture();
  const scoped = createRotatingJwksTransportAuthenticator({
    discovery: f.discovery, audience, requiredScope: 'agent-teams:read',
    isRevoked: async () => false, now: () => 2000000000,
  });
  await assert.rejects(scoped(request(jwt(first, 'old'))), /denied/);
  await assert.rejects(scoped(request(jwt(first, 'old', { ...claims, scope: 'other:read' }))), /denied/);
  const ok = await scoped(request(jwt(first, 'old', { ...claims, scope: 'agent-teams:read' })));
  assert.equal(ok.principalId, issuer + '#alice');
});
