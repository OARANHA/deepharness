/** Internal read-only module for an existing initialized official DSH host.
 * Starts no listener; does not register a plugin, create sessions or run agents.
 * All inputs are trusted server configuration, never MCP tool arguments.
 */
import { createDshHostReadBinding } from './adapters/dsh-host-read-binding.mjs';
import { createRotatingJwksTransportAuthenticator } from './adapters/rotating-jwks-transport-authenticator.mjs';
import {createPostgresReadGrantStore} from './adapters/postgres-read-grants.mjs';
import { createPostgresRevocationBackend } from './adapters/postgres-token-revocation.mjs';
import { createMcpOAuthHttpGate } from './adapters/mcp-oauth-http-gate.mjs';
const deny = () => { throw Error('Agent Teams read denied'); };
export function createOfficialDshMcpReadRuntime(host, {
  discovery, issuer, resource, query, grants, allowedOrigins, grantMode = 'static',
  allowMissingNotBefore = false, revocationTimeoutMs = 1000,
} = {}) {
  if (typeof discovery?.get !== 'function' || typeof query !== 'function' ||
      typeof issuer !== 'string' || !['static','postgres'].includes(grantMode) ||
      (grantMode==='static'?!Array.isArray(grants):grants!==undefined) ||
      !Array.isArray(allowedOrigins)) deny();
  const backend = createPostgresRevocationBackend({ query, timeoutMs: revocationTimeoutMs });
  // Pin the independently selected issuer even if a discovery implementation
  // is accidentally configured for a different authorization server.
  const pinnedDiscovery = { get: async () => {
    const snapshot = await discovery.get();
    if (snapshot?.issuer !== issuer) deny();
    return snapshot;
  } };
  const authenticateTransport = createRotatingJwksTransportAuthenticator({
    discovery: pinnedDiscovery, audience: resource, isRevoked: backend.isRevoked,
    requiredScope: 'agent-teams:read', allowMissingNotBefore,
  });
  const binding = createDshHostReadBinding(host, {
    authenticateTransport, grants:grantMode==='static'?grants:[], allowedOrigins,
    ...(grantMode==='postgres'?{hasReadGrant:createPostgresReadGrantStore({query,timeoutMs:revocationTimeoutMs}).hasReadGrant}:{}),
  });
  const gate = createMcpOAuthHttpGate({ resource, issuer, authenticateTransport });
  return Object.freeze({
    runHttpRequest: binding.runHttpRequest,
    readTeam: binding.readTeam,
    handleOAuthRequest: gate.handle,
  });
}
