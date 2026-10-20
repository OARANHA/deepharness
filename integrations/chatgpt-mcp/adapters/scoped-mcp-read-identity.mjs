/**
 * Server-only composition. Never pass MCP tool arguments as serverRequest.
 * authenticateRequest must validate the actual incoming Bearer request using
 * the existing server authentication gate, including credential revocation.
 * It returns { principalId, kind: 'service' | 'individual' } or denies.
 * A shared Bearer can identify only a configured service, never a human.
 * hasReadGrant must consult current explicit principal/workspace/Lead grants;
 * DSH workspace membership is not a principal ACL. No default/wildcard grant.
 * This module registers no endpoint and does not replace origin/approval gates.
 */
import { createDshAgentTeamHostReader } from './dsh-agent-teams-host-reader.mjs';

const deny = () => { throw new Error('Agent Teams read denied'); };
const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 256;

export function createScopedMcpReadIdentity({
  authenticateRequest, hasReadGrant, workspaceRegistry,
  sessionProjections, resolveLiveLeadSession,
}) {
  if (typeof authenticateRequest !== 'function' || typeof hasReadGrant !== 'function') deny();
  return async function readTeam(args, serverRequest) {
    if (!serverRequest || typeof serverRequest !== 'object') deny();
    // Copy only target identifiers; all identity/permission claims are ignored.
    const target = { workspaceId: args?.workspaceId, leadSessionId: args?.leadSessionId };
    if (!valid(target.workspaceId) || !valid(target.leadSessionId)) deny();
    let bound;
    const authenticate = async () => {
      let identity;
      try { identity = await authenticateRequest(serverRequest); } catch { deny(); }
      if (!valid(identity?.principalId) ||
          !['service', 'individual'].includes(identity.kind)) deny();
      const current = { principalId: identity.principalId, kind: identity.kind };
      if (bound && (bound.principalId !== current.principalId || bound.kind !== current.kind)) deny();
      bound ??= current;
      return current.principalId;
    };
    const check = async scope => {
      if (await authenticate() !== scope.principalId) deny();
      let allowed;
      try { allowed = await hasReadGrant(Object.freeze({ ...scope })); } catch { deny(); }
      if (allowed !== true) deny();
      return true;
    };
    const reader = createDshAgentTeamHostReader({
      workspaceRegistry, sessionProjections, resolveLiveLeadSession,
      principalFromTransport: authenticate,
      authorizePrincipal: check,
    });
    const result = await reader(target);
    // Recheck after materializing the detached model, immediately before return.
    await check({ principalId: bound.principalId, ...target });
    return result;
  };
}
