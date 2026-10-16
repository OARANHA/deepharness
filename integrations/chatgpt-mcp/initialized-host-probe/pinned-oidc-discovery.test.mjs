import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createPinnedOidcDiscovery } from '../adapters/pinned-oidc-discovery.mjs';
const issuer = 'https://identity.example';
const discoveryUri = issuer + '/.well-known/openid-configuration';
const jwksUri = issuer + '/keys';
const jwk = { ...generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' }),
  kid: 'key1', alg: 'RS256', use: 'sig' };
const discovery = { issuer, jwks_uri: jwksUri, id_token_signing_alg_values_supported: ['RS256'] };
const response = data => new Response(JSON.stringify(data), { status: 200,
  headers: { 'content-type': 'application/json' } });
test('pinned discovery coalesces requests, caches results and atomically rotates JWKS', async () => {
  let now = 1000, reads = [], keys = [jwk];
  const fetcher = async (uri, opts) => {
    reads.push([uri, opts.redirect, opts.cache]);
    return response(uri === discoveryUri ? discovery : { keys });
  };
  const client = createPinnedOidcDiscovery({ issuer, discoveryUri, jwksUri, fetcher, now: () => now, ttlMs: 1000 });
  const [first, simultaneous] = await Promise.all([client.get(), client.get()]);
  assert.equal(first, simultaneous);
  assert.equal(reads.length, 2);
  assert.equal((await client.get()), first);
  assert.equal(reads.length, 2);
  keys = [{ ...jwk, kid: 'key2' }];
  now += 1001;
  const rotated = await client.get();
  assert.deepEqual(Object.keys(rotated.publicKeys), ['key2']);
  assert.equal(reads.length, 4);
  assert.ok(reads.every(x => x[1] === 'error' && x[2] === 'no-store'));
});
test('pinned discovery rejects substitution, redirects, oversized response and unsafe config', async () => {
  assert.throws(() => createPinnedOidcDiscovery({ issuer, discoveryUri, jwksUri: 'https://other.example/keys' }), /denied/);
  assert.throws(() => createPinnedOidcDiscovery({ issuer, discoveryUri: issuer + '/wrong', jwksUri }), /denied/);
  for (const fetcher of [
    async uri => response(uri === discoveryUri ? { ...discovery, jwks_uri: issuer + '/untrusted' } : { keys: [jwk] }),
    async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }),
    async () => new Response('x'.repeat(2000), { headers: { 'content-type': 'application/json' } }),
  ]) {
    const client = createPinnedOidcDiscovery({ issuer, discoveryUri, jwksUri, fetcher, maxBytes: 1024 });
    await assert.rejects(client.get(), /denied/);
  }
});
test('failed key rotation never returns stale keys past expiry', async () => {
  let now = 1000, fail = false;
  const fetcher = async uri => fail ? response({ keys: [] }) :
    response(uri === discoveryUri ? discovery : { keys: [jwk] });
  const client = createPinnedOidcDiscovery({ issuer, discoveryUri, jwksUri, fetcher, now: () => now, ttlMs: 1000 });
  await client.get();
  now += 1001; fail = true;
  await assert.rejects(client.get(), /denied/);
  await assert.rejects(client.get(), /denied/);
});
