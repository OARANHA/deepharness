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
  // Verify the exact official host references on every authority check and
  // snapshot invocation, not only when the live session is first resolved.
  const checkHost = () => {
    if (ctx.workspaceRegistry !== workspaceRegistry ||
        ctx.sessions !== sessions ||
        ctx.sessionProjections !== sessionProjections) deny();
  };
  const guardedWorkspaceRegistry = {
    get(id) { checkHost(); return workspaceRegistry.get(id); },
  };
  const guardedSessionProjections = {
    snapshot(session, keys) {
      checkHost();
      if (!session || sessions.get(session.id) !== session) deny();
      return sessionProjections.snapshot(session, keys);
    },
  };
  const binding = createMcpReadRequestContext({
    ...policy,
    workspaceRegistry: guardedWorkspaceRegistry,
    sessionProjections: guardedSessionProjections,
    resolveLiveLeadSession: async id => {
      checkHost();
      const session = sessions.get(id);
      if (!session || session.id !== id) return undefined;
      // Reject a stale session handle or a swapped provider before projection.
      checkHost();
      if (sessions.get(id) !== session) deny();
      return session;
    },
  });
  return Object.freeze({
    ...binding,
    // Must be invoked only by server code for the same request lifecycle.
    // The underlying reader revalidates workspace membership and grants.
  });
}
