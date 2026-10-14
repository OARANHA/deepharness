import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { validatePinnedOidcMetadata } from '../adapters/pinned-oidc-metadata.mjs';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
const issuer = 'https://identity.example';
const allowedJwksUri = issuer + '/keys';
const discovery = { issuer, jwks_uri: allowedJwksUri,
  id_token_signing_alg_values_supported: ['RS256'] };
const input = { issuer, allowedJwksUri, discovery, jwks: { keys: [jwk] } };
const check = change => validatePinnedOidcMetadata({ ...input, ...change });
test('pinned OIDC discovery and JWKS return public-only keys for JWT verifier', () => {
  const parsed = check();
  assert.equal(parsed.issuer, issuer);
  assert.deepEqual(Object.keys(parsed.publicKeys), ['key-1']);
  assert.equal(parsed.publicKeys['key-1'].d, undefined);
  assert.equal(typeof createPinnedJwtTransportAuthenticator({
    ...parsed, audience: 'deep-mcp', isRevoked: async () => false,
  }), 'function');
});
test('reject substituted issuer, cross-origin or unpinned JWKS, private keys and duplicate kid', () => {
  const invalid = [
    { discovery: { ...discovery, issuer: 'https://evil.example' } },
    { discovery: { ...discovery, jwks_uri: 'https://evil.example/keys' } },
    { discovery: { ...discovery, jwks_uri: issuer + '/other' } },
    { allowedJwksUri: issuer + '/other' },
    { discovery: { ...discovery, jwks_uri: 'http://identity.example/keys' } },
    { discovery: { ...discovery, id_token_signing_alg_values_supported: ['HS256'] } },
    { jwks: { keys: [jwk, jwk] } },
    { jwks: { keys: [{ ...jwk, d: 'private-key-material' }] } },
    { jwks: { keys: [{ ...jwk, alg: 'HS256' }] } },
    { jwks: { keys: [{ ...jwk, use: 'enc' }] } },
    { jwks: { keys: [] } },
    { issuer: 'http://identity.example' },
    { issuer: 'https://alice@identity.example' },
    { issuer: 'https://identity.example/#fragment' },
  ];
  for (const change of invalid) assert.throws(() => check(change), /denied/);
});
