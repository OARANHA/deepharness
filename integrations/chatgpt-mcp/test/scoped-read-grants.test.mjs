import { projectionFixture } from './projection-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedReadGrants } from '../adapters/scoped-read-grants.mjs';
import { createBearerScopedTeamReader } from '../adapters/bearer-scoped-team-reader.mjs';
import { randomBytes } from 'node:crypto';

const scope = { principalId: 'service', workspaceId: 'ws', leadSessionId: 'lead' };
test('default deny and exact tuple grant only', () => {
  const policy = createScopedReadGrants();
  assert.equal(policy.hasReadGrant(scope), false);
  policy.replace([scope]);
  assert.equal(policy.hasReadGrant(scope), true);
  for (const key of Object.keys(scope)) assert.equal(policy.hasReadGrant({ ...scope, [key]: 'other' }), false);
});
test('snapshots grants and denies malformed/wildcard policies atomically', () => {
  const source = [{ ...scope }];
  const policy = createScopedReadGrants(source);
  source[0].workspaceId = 'changed'; source.length = 0;
  assert.equal(policy.hasReadGrant(scope), true);
  for (const value of [null, {}, [{ ...scope, principalId: '*' }], [{ ...scope, workspaceId: '' }], [{ ...scope, leadSessionId: 3 }]]) {
    assert.throws(() => policy.replace(value), /invalid read grants/);
    assert.equal(policy.hasReadGrant(scope), true);
  }
  assert.equal(policy.hasReadGrant(null), false);
});
test('tuple keys cannot collide through delimiters', () => {
  const policy = createScopedReadGrants([{ principalId: 'a/b', workspaceId: 'c', leadSessionId: 'd' }]);
  assert.equal(policy.hasReadGrant({ principalId: 'a', workspaceId: 'b/c', leadSessionId: 'd' }), false);
});
test('replace and revoke take immediate effect', () => {
  const policy = createScopedReadGrants([scope]);
  assert.equal(policy.revoke(scope), true);
  assert.equal(policy.hasReadGrant(scope), false);
  policy.replace([scope]); policy.replace([]);
  assert.equal(policy.hasReadGrant(scope), false);
});
test('real grant revocation while Bearer reader awaits projection denies data', async () => {
  const policy = createScopedReadGrants([scope]);
  const token = randomBytes(32).toString('base64url');
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const projection = new Promise(resolve => { release = resolve; });
  const read = createBearerScopedTeamReader({
    currentCredential: () => ({ authMode: 'token', authToken: token, principalId: 'service' }),
    hasReadGrant: policy.hasReadGrant,
    workspaceRegistry: { get: () => ({ id: 'ws', sessionIds: ['lead'] }) },
    resolveLiveLeadSession: async () => ({}),
    sessionProjections: projectionFixture({ read: () => { entered(); return projection; } }),
  });
  const pending = read(scope, { headers: { authorization: 'Bearer ' + token } });
  await started;
  policy.revoke(scope);
  release({ members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] });
  await assert.rejects(pending, /read denied/);
});
