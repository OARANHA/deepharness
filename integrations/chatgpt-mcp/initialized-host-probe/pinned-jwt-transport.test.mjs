import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const issuer = 'https://id.example', audience = 'deep-mcp';
const time = 2000000000;
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const claims = { iss: issuer, aud: audience, sub: 'alice', jti: 'j1',
  iat: time - 20, nbf: time - 20, exp: time + 100, token_use: 'access' };
function token(payload = claims, header = { alg: 'RS256', kid: 'k1', typ: 'JWT' }, key = privateKey) {
  const body = encode(header) + '.' + encode(payload);
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}
const headers = value => ({ authorization: 'Bearer ' + value, origin: 'https://client.example' });
function verifier(overrides = {}) {
  return createPinnedJwtTransportAuthenticator({
    issuer, audience, publicKeys: { k1: { ...publicKey.export({ format: 'jwk' }), alg: 'RS256' } },
    isRevoked: async () => false, now: () => time, ...overrides,
  });
}
test('signed access JWT binds an individual principal to exact grants and revocation', async () => {
  const revoked = new Set();
  const authenticateTransport = verifier({ isRevoked: async ({ tokenId }) => revoked.has(tokenId) });
  const binding = createMcpReadRequestContext({
    authenticateTransport, allowedOrigins: ['https://client.example'],
    grants: [{ principalId: issuer + '#alice', workspaceId: 'ws', leadSessionId: 'lead' }],
    workspaceRegistry: { get: id => id === 'ws' ? { id: 'ws', sessionIds: ['lead'] } : undefined },
    resolveLiveLeadSession: async id => id === 'lead' ? { id: 'lead' } : undefined,
    sessionProjections: { snapshot: () => ({ values: { agentTeam:
      { members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }], tasks: [] } } }) },
  });
  const target = { workspaceId: 'ws', leadSessionId: 'lead' };
  const read = jwt => binding.runHttpRequest({ headers: headers(jwt) }, () => binding.readTeam(target));
  assert.equal((await read(token())).leadSessionId, 'lead');
  await assert.rejects(read(token({ ...claims, sub: 'bob' })), /denied/);
  revoked.add('j1');
  await assert.rejects(read(token()), /denied/);
});
test('reject invalid signature, issuer, audience, lifetime, algorithm, kind and revocation lookup failure', async () => {
  const verify = verifier();
  const bad = [
    token(claims, undefined, other.privateKey),
    token({ ...claims, iss: 'https://wrong.example' }),
    token({ ...claims, aud: 'other' }),
    token({ ...claims, exp: time }),
    token({ ...claims, nbf: time + 1 }),
    token({ ...claims, iat: time + 1 }),
    token({ ...claims, iat: time - 4000, nbf: time - 4000 }),
    token({ ...claims, token_use: 'id' }),
    token({ ...claims, jti: '' }),
    token(claims, { alg: 'none', kid: 'k1', typ: 'JWT' }),
    token(claims, { alg: 'RS256', kid: 'unknown', typ: 'JWT' }),
    token(claims, { alg: 'RS256', kid: 'k1', typ: 'JWT', crit: ['x'] }),
    token(claims).slice(0, -5) + 'aaaaa',
    'not-a-jwt',
  ];
  for (const jwt of bad) await assert.rejects(verify({ headers: headers(jwt) }), /denied/);
  await assert.rejects(verifier({ isRevoked: async () => { throw new Error('offline'); } })
    ({ headers: headers(token()) }), /denied/);
  await assert.rejects(verifier({ isRevoked: async () => undefined })
    ({ headers: headers(token()) }), /denied/);
  assert.throws(() => verifier({ publicKeys: { k1: { kty: 'oct', k: 'c2VjcmV0', alg: 'RS256' } } }), /denied/);
  assert.throws(() => verifier({ isRevoked: undefined }), /denied/);
});

test('deny oversize composed principal before returning transport identity', async () => {
  const longIssuer = 'https://id.example/' + 'a'.repeat(257 - 'https://id.example/#alice'.length);
  assert.equal((longIssuer + '#alice').length, 257);
  const authenticate = verifier({ issuer: longIssuer });
  const signed = token({ ...claims, iss: longIssuer });
  await assert.rejects(authenticate({ headers: headers(signed) }), /denied/);
});
