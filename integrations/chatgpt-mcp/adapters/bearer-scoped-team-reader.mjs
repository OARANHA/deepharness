/**
 * Server-only Bearer binding. Supply the actual IncomingMessage separately
 * from MCP arguments. currentCredential reads the active server configuration
 * on every check; secrets are never returned, logged or persisted here.
 * Shared Bearer identifies a service, never an individual user.
 * Existing HTTP origin and approval gates must run independently.
 */
import { timingSafeEqual } from 'node:crypto';
import { createScopedMcpReadIdentity } from './scoped-mcp-read-identity.mjs';

const deny = () => { throw new Error('Agent Teams read denied'); };
export function createBearerServiceAuthenticator(currentCredential) {
  if (typeof currentCredential !== 'function') deny();
  return async request => {
      const configured = await currentCredential();
      if (configured?.authMode !== 'token' ||
          typeof configured.authToken !== 'string' || configured.authToken.length === 0 ||
          typeof configured.principalId !== 'string' || configured.principalId.length === 0) deny();
      const header = request?.headers?.authorization;
      if (typeof header !== 'string' || header.length > 8192) deny();
      // Full header only: reject duplicates, control characters and whitespace
      // inside a credential. Matches the upstream Bearer scheme, more strictly.
      const match = /^Bearer[ \t]+([^\s,]+)$/i.exec(header);
      if (!match) deny();
      const supplied = Buffer.from(match[1]);
      const expected = Buffer.from(configured.authToken);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) deny();
      return { principalId: configured.principalId, kind: 'service' };
  };
}

export function createBearerScopedTeamReader({ currentCredential, ...host }) {
  return createScopedMcpReadIdentity({
    ...host,
    authenticateRequest: createBearerServiceAuthenticator(currentCredential),
  });
}
