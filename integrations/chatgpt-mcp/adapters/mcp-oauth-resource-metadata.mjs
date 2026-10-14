/** Server-owned OAuth/MCP metadata contract. No listener, token issuer or OAuth client flow.
 * The MCP resource server publishes metadata; ChatGPT, as OAuth client,
 * owns authorization-code PKCE generation and callback validation.
 */
const deny = () => { throw new Error('MCP OAuth metadata denied'); };
const url = x => {
  if (typeof x !== 'string' || x.length > 2048) deny();
  let u; try { u = new URL(x); } catch { deny(); }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password ||
      u.search || u.hash || (u.href !== x && !(u.pathname === '/' && u.origin === x))) deny();
  return u;
};
export function createMcpOAuthResourceMetadata({ resource, issuer, scope = 'agent-teams:read' }) {
  url(resource); url(issuer);
  if (scope !== 'agent-teams:read') deny();
  return Object.freeze({
    resource,
    authorization_servers: Object.freeze([issuer]),
    scopes_supported: Object.freeze([scope]),
    bearer_methods_supported: Object.freeze(['header']),
  });
}
export function validatePinnedOAuthServerMetadata({ issuer, metadata }) {
  url(issuer);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      metadata.issuer !== issuer) deny();
  const auth = url(metadata.authorization_endpoint), token = url(metadata.token_endpoint);
  const root = new URL(issuer).origin;
  if (auth.origin !== root || token.origin !== root) deny();
  if (!Array.isArray(metadata.response_types_supported) ||
      !metadata.response_types_supported.includes('code') ||
      !Array.isArray(metadata.code_challenge_methods_supported) ||
      !metadata.code_challenge_methods_supported.includes('S256') ||
      !Array.isArray(metadata.grant_types_supported) ||
      !metadata.grant_types_supported.includes('authorization_code')) deny();
  return Object.freeze({ issuer, authorizationEndpoint: auth.href,
    tokenEndpoint: token.href, pkceMethod: 'S256' });
}
export function createMcpOAuthChallenge({ metadataUri, scope = 'agent-teams:read' }) {
  url(metadataUri);
  if (scope !== 'agent-teams:read') deny();
  return 'Bearer resource_metadata="' + metadataUri + '", scope="' + scope + '"';
}
