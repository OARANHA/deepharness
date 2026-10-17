/**
 * Fail-closed authorization boundary for a future Agent Teams MCP reader.
 * This is deliberately transport-independent. A trusted integration layer
 * must resolve caller identity, workspace ownership and session ownership
 * from authoritative host services, never from user-supplied arguments.
 */
import { projectAgentTeam } from './agent-teams-read-model.mjs';

function validId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 256;
}

/**
 * @param {object} request
 * @param {string} request.leadSessionId Untrusted requested target ID
 * @param {object} authority Trusted, freshly resolved host-side authorization
 * @param {string} authority.authenticatedPrincipalId
 * @param {string} authority.authorizedPrincipalId
 * @param {string} authority.workspaceId
 * @param {string} authority.sessionWorkspaceId
 * @param {string} authority.authorizedLeadSessionId
 * @param {boolean} authority.canReadTeamProjection
 * @param {object} projection Trusted projection fetched only after this gate
 */
export function assertAgentTeamReadAuthorized(request, authority) {
  if (!request || !authority ||
      !validId(request.leadSessionId) ||
      !validId(authority.authenticatedPrincipalId) ||
      !validId(authority.authorizedPrincipalId) ||
      !validId(authority.workspaceId) ||
      !validId(authority.sessionWorkspaceId) ||
      !validId(authority.authorizedLeadSessionId) ||
      authority.authenticatedPrincipalId !== authority.authorizedPrincipalId ||
      authority.workspaceId !== authority.sessionWorkspaceId ||
      request.leadSessionId !== authority.authorizedLeadSessionId ||
      authority.canReadTeamProjection !== true) {
    throw new Error('Agent Teams read denied');
  }
}

/**
 * A provider must implement trusted host lookups and return *both* authority
 * and projection. This function intentionally checks the authorization gate
 * before invoking readProjection; never accepts projection in the request.
 */
export async function readAuthorizedAgentTeam(request, provider) {
  if (!provider || typeof provider.resolveAuthority !== 'function' ||
      typeof provider.readProjection !== 'function') {
    throw new Error('Agent Teams read denied');
  }
  // The exact principal should be bound to a trusted transport by provider.
  // Authorization may not be inferred from knowledge of a session ID.
  const authority = await provider.resolveAuthority(request?.leadSessionId);
  assertAgentTeamReadAuthorized(request, authority);
  const projection = await provider.readProjection(authority.authorizedLeadSessionId, authority);
  return projectAgentTeam(authority.authorizedLeadSessionId, projection);
}
