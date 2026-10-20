import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicOidcAddress, resolvePublicOidcAddresses } from '../adapters/oidc-egress-address-policy.mjs';
import { createAuthoritativeRevocationCheck } from '../adapters/authoritative-revocation-check.mjs';

test('OIDC address preflight denies private, loopback, reserved and mixed DNS', async () => {
  for (const addr of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.1.2',
    '169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1',
    '192.0.2.1','198.51.100.1','203.0.113.2','::1','fc00::1',
    'fe80::1','::ffff:127.0.0.1','2001:db8::1']) {
    assert.throws(() => assertPublicOidcAddress(addr), /denied/, addr);
  }
  assert.equal(assertPublicOidcAddress('8.8.8.8'), '8.8.8.8');
  const good = await resolvePublicOidcAddresses('issuer.example', async () =>
    [{ address: '8.8.8.8', family: 4 }]);
  assert.deepEqual([...good], ['8.8.8.8']);
  await assert.rejects(resolvePublicOidcAddresses('issuer.example', async () =>
    [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), /denied/);
  await assert.rejects(resolvePublicOidcAddresses('issuer.example', async () => []), /denied/);
});
test('authoritative revocation denies unknown, timeout and errors', async () => {
  const scope = { issuer: 'https://issuer.example', subject: 'alice', tokenId: 'jti-1' };
  const allowed = createAuthoritativeRevocationCheck({ lookup: async () => false });
  assert.equal(await allowed(scope), false);
  for (const result of [true, null, undefined, 'false']) {
    const check = createAuthoritativeRevocationCheck({ lookup: async () => result });
    await assert.rejects(check(scope), /denied/);
  }
  await assert.rejects(createAuthoritativeRevocationCheck({
    lookup: async () => { throw new Error('offline'); },
  })(scope), /denied/);
  await assert.rejects(createAuthoritativeRevocationCheck({
    lookup: () => new Promise(() => {}), timeoutMs: 50,
  })(scope), /denied/);
  await assert.rejects(allowed({ ...scope, tokenId: '' }), /denied/);
});
