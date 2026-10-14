/**
 * Server-owned HTTP MCP dispatch binding. Wrap EACH handleRequest, including
 * existing sessions. Tool args/body/session IDs never supply request identity.
 * Starts no listener. Exposes no agent writes or grant-management MCP tools.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createBearerServiceAuthenticator } from './bearer-scoped-team-reader.mjs';
import { createScopedMcpReadIdentity } from './scoped-mcp-read-identity.mjs';
import { createScopedReadGrants } from './scoped-read-grants.mjs';
const deny = () => { throw new Error('Agent Teams read denied'); };
export function createMcpReadRequestContext({
  currentCredential, authenticateTransport, grants = [], allowedOrigins = [], allowMissingOrigin = false, ...host
}) {
  if (!Array.isArray(allowedOrigins) || typeof allowMissingOrigin !== 'boolean') deny();
  const origins = new Set();
  for (const origin of allowedOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { deny(); }
    if (typeof origin !== 'string' || parsed.origin !== origin ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) deny();
    origins.add(origin);
  }
  const policy = createScopedReadGrants(grants);
  // Only the embedding server may supply this already-verified identity resolver.
  // Never treat user headers or MCP arguments as verified principal claims.
  if (authenticateTransport !== undefined && typeof authenticateTransport !== 'function') deny();
  const authenticate = authenticateTransport ?? createBearerServiceAuthenticator(currentCredential);
  const verified = async request => {
    const identity = await authenticate(request);
    if (typeof identity?.principalId !== 'string' ||
        identity.principalId.length === 0 || identity.principalId.length > 256 ||
        !['service', 'individual'].includes(identity.kind)) deny();
    return { principalId: identity.principalId, kind: identity.kind };
  };
  const contexts = new AsyncLocalStorage();
  const reader = createScopedMcpReadIdentity({
    ...host,
    authenticateRequest: async request => {
      const context = contexts.getStore();
      if (!context?.active || context.request !== request) deny();
      const identity = await verified(request);
      if (!context.active || identity.principalId !== context.principalId ||
          identity.kind !== context.kind) deny();
      return identity;
    },
    hasReadGrant: policy.hasReadGrant,
  });
  return Object.freeze({
    runHttpRequest: async (serverRequest, dispatch) => {
      if (typeof dispatch !== 'function') deny();
      const origin = serverRequest?.headers?.origin;
      if (origin === undefined ? !allowMissingOrigin :
          typeof origin !== 'string' || !origins.has(origin)) deny();
      const request = Object.freeze({ headers: Object.freeze({
        authorization: serverRequest?.headers?.authorization, origin,
      }) });
      let identity;
      try { identity = await verified(request); } catch { deny(); }
      const context = { request, principalId: identity.principalId, kind: identity.kind, active: true };
      return contexts.run(context, async () => {
        try { return await dispatch(); } finally { context.active = false; }
      });
    },
    readTeam: async args => {
      const context = contexts.getStore();
      if (!context?.active) deny();
      const result = await reader(args, context.request);
      if (!context.active) deny();
      return result;
    },
    // Trusted server administration only; never register as MCP tools.
    replaceGrants: policy.replace,
    revokeGrant: policy.revoke,
  });
}
