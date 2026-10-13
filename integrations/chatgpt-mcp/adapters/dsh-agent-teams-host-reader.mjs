/**
 * Host-side adapter for official DSH workspace and Session projection services.
 *
 * TRUST BOUNDARY: only the embedding plugin may construct this provider.
 * It MUST supply a transport-authenticated principal and a separately
 * reviewed policy. DSH WorkspaceRegistry has no per-principal ACL.
 * This adapter cannot grant access by itself.
 */
import { readAuthorizedAgentTeam } from './agent-teams-read-authorization.mjs';

const deny = () => { throw new Error('Agent Teams read denied'); };
const valid = x => typeof x === 'string' && x.length > 0 && x.length <= 256;

export function createDshAgentTeamHostReader({ workspaceRegistry, sessionProjections, resolveLiveLeadSession, authorizePrincipal, principalFromTransport }) {
  if (typeof workspaceRegistry?.get !== 'function' ||
      typeof sessionProjections?.snapshot !== 'function' ||
      typeof resolveLiveLeadSession !== 'function' ||
      typeof authorizePrincipal !== 'function' ||
      typeof principalFromTransport !== 'function') deny();

  return async function readTeam({ leadSessionId, workspaceId }, transportContext) {
    if (!valid(leadSessionId) || !valid(workspaceId)) deny();
    // Do not accept caller claims of their identity or capability.
    const principalId = await principalFromTransport(transportContext);
    if (!valid(principalId)) deny();

    const readAuthority = async () => {
      const workspace = workspaceRegistry.get(workspaceId);
      // sessionIds are header-validated by the DSH WorkspaceRegistry.
      if (!workspace || workspace.id !== workspaceId ||
          !Array.isArray(workspace.sessionIds) ||
          !workspace.sessionIds.includes(leadSessionId)) deny();
      const permission = await authorizePrincipal({ principalId, workspaceId, leadSessionId });
      if (permission !== true) deny();
      return {
        authenticatedPrincipalId: principalId,
        authorizedPrincipalId: principalId,
        workspaceId,
        sessionWorkspaceId: workspace.id,
        authorizedLeadSessionId: leadSessionId,
        canReadTeamProjection: true,
      };
    };

    return readAuthorizedAgentTeam({ leadSessionId }, {
      resolveAuthority: readAuthority,
      readProjection: async () => {
        // Do not load/cold-resume an agent just to read its Team data.
        // resolveLiveLeadSession must not spawn, mutate, or elevate authority.
        const session = await resolveLiveLeadSession(leadSessionId);
        if (!session) deny();
        // Re-authorize AFTER the potentially async session resolution:
        // revocation and detach must not return stale sensitive output.
        await readAuthority();
        const projection = sessionProjections.snapshot(session, ['agentTeam']);
        if (!projection) deny();
        // A projection may be async in future host adapters; do not assume a
        // previously granted access survives the read boundary.
        const snapshot = await projection;
        const resolved = snapshot?.values?.agentTeam;
        if (!resolved) deny();
        await readAuthority();
        return resolved;
      },
    });
  };
}
