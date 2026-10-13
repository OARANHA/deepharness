/**
 * Connect an existing, initialized DSH 0.2.1-alpha.2 Cordis host to the
 * scoped read-only reader. This does not start an HTTP server or an agent.
 * Trusted configuration (credentials/grants/origins) stays server-owned.
 */
import { createMcpReadRequestContext } from './mcp-read-request-context.mjs';

const deny = () => { throw new Error('Agent Teams read denied'); };

export function createDshHostReadBinding(ctx, policy) {
  if (!ctx || !policy || typeof policy !== 'object' ||
      typeof ctx.workspaceRegistry?.get !== 'function' ||
      typeof ctx.sessions?.get !== 'function' ||
      typeof ctx.sessionProjections?.snapshot !== 'function') deny();

  const { workspaceRegistry, sessions, sessionProjections } = ctx;
  const binding = createMcpReadRequestContext({
    ...policy,
    workspaceRegistry,
    sessionProjections,
    resolveLiveLeadSession: async id => {
      const session = sessions.get(id);
      if (!session || session.id !== id) return undefined;
      // Reject a stale session handle or a swapped provider before projection.
      if (ctx.sessions !== sessions ||
          ctx.workspaceRegistry !== workspaceRegistry ||
          ctx.sessionProjections !== sessionProjections ||
          sessions.get(id) !== session) deny();
      return session;
    },
  });
  return Object.freeze({
    ...binding,
    // Must be invoked only by server code for the same request lifecycle.
    // The underlying reader revalidates workspace membership and grants.
  });
}
