/** Trusted DSH 0.2.1-alpha.2 host injection contract; no HTTP listener or session creation.
 * The caller (official initialized plugin) must supply actual host services,
 * not MCP arguments, browser cookies, or an upstream bridge write-capability.
 */
import { createMcpReadRequestContext } from './mcp-read-request-context.mjs';
const deny = () => { throw new Error('Agent Teams read denied'); };
export function prepareOfficialDshTeamRead({
  workspaceRegistry, sessionProjections, resolveLiveLeadSession,
  authenticateTransport, grants, allowedOrigins,
}) {
  if (typeof workspaceRegistry?.get !== 'function' ||
      typeof sessionProjections?.snapshot !== 'function' ||
      typeof resolveLiveLeadSession !== 'function' ||
      typeof authenticateTransport !== 'function' ||
      !Array.isArray(grants) || !Array.isArray(allowedOrigins)) deny();
  // Validates the injected interfaces eagerly. The official host supplies
  // live WorkspaceRegistry, SessionProjections and non-resuming Lead lookup.
  // No capability fallback to mutable ctx.agents APIs.
  const binding = createMcpReadRequestContext({
    workspaceRegistry, sessionProjections, resolveLiveLeadSession,
    authenticateTransport, grants, allowedOrigins,
  });
  return Object.freeze({
    runHttpRequest: binding.runHttpRequest,
    readTeam: binding.readTeam,
    // grant mutation deliberately not exported across this boundary
  });
}
