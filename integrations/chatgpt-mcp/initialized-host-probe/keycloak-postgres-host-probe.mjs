/** CI only: real Keycloak human JWT -> official DSH -> primary revocation.
 * Never serializes bearer/credentials; fixed loopback DB and container name.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createPostgresRevocationBackend } from '../adapters/postgres-token-revocation.mjs';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';
import { probeKeycloakOfficialHost } from './keycloak-official-host-probe.mjs';
const exec = promisify(execFile);
const container = 'keycloak-mcp-postgres';
export async function probePersistentKeycloakHost({ issuer, resource, keys, claims, request, principal }) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.PGHOST !== '127.0.0.1' ||
      process.env.PGPORT !== '15432' || process.env.PGDATABASE !== 'token_revocation_test' ||
      process.env.PGUSER !== 'integration' || !process.env.PGPASSWORD) {
    throw Error('Disposable CI PostgreSQL configuration required');
  }
  const open = () => new Pool({ host: '127.0.0.1', port: 15432, database: 'token_revocation_test',
    user: 'integration', password: process.env.PGPASSWORD, max: 1,
    connectionTimeoutMillis: 1000, idleTimeoutMillis: 1000, allowExitOnIdle: true });
  let pool = open();
  let lookupFailures = 0;
  const backend = () => createPostgresRevocationBackend({
    timeoutMs: 1500,
    query: async (sql, params) => {
      try { return await pool.query(sql, params); }
      catch { lookupFailures++; throw Error('Disposable revocation database unavailable'); }
    },
  });
  const verifier = store => createPinnedJwtTransportAuthenticator({
    issuer, audience: resource, publicKeys: keys, requiredScope: 'agent-teams:read',
    allowMissingNotBefore: true, isRevoked: store.isRevoked,
  });
  const identity = { issuer, subject: claims.sub, tokenId: claims.jti };
  let phase = 'schema';
  try {
    await pool.query(await readFile(new URL('../sql/001_token_revocations.sql', import.meta.url), 'utf8'));
    const store = backend();
    assert.equal(await store.isRevoked(identity), false);
    phase = 'official host';
    await probeKeycloakOfficialHost({
      authenticateTransport: verifier(store), request, principal,
      revoke: () => store.revoke(identity),
    });
    await assert.rejects(verifier(store)(request), /denied/);
    phase = 'client restart';
    await pool.end();
    pool = open();
    await assert.rejects(verifier(backend())(request), /denied/);
    phase = 'server restart';
    await pool.end();
    // Restart the same disposable container: do not remove/recreate its data.
    await exec('docker', ['restart', container], { timeout: 30000 });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await exec('docker', ['exec', container, 'pg_isready', '-U', 'integration', '-d', 'token_revocation_test'],
          { timeout: 2000 });
        ready = true; break;
      } catch { await delay(500); }
    }
    assert.ok(ready, 'disposable PostgreSQL must recover after actual container restart');
    pool = open();
    const restored = backend();
    await assert.rejects(verifier(restored)(request), /denied/);
    assert.equal(await restored.isRevoked({ ...identity, tokenId: 'never-revoked-after-restart' }), false);
    phase = 'database unavailable';
    await pool.end();
    await exec('docker', ['stop', container], { timeout: 30000 });
    pool = open();
    const failedBefore = lookupFailures;
    await assert.rejects(verifier(backend())(request), /denied/);
    assert.ok(lookupFailures > failedBefore, 'request must reach authoritative unavailable DB and fail closed');
    await assert.rejects(backend().isRevoked({ ...identity, tokenId: 'never-revoked-offline' }), /denied/);
    console.log('KEYCLOAK_OFFICIAL_DSH_POSTGRES_REVOCATION_MATCH: real human JWT + exact official read + persisted revocation + client/server restart + database failure denied');
  } catch {
    // Suppress nested database/network/token objects from CI assertion output.
    throw Error('Persistent Keycloak official-host gate failed at ' + phase);
  } finally {
    await pool.end().catch(() => {});
  }
}
