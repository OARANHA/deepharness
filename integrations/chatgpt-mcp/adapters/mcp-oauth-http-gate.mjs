/** Opt-in HTTP integration surface for OAuth protected-resource discovery.
 * This module starts NO listener and never issues tokens or creates grants.
 * Install before MCP SDK dispatch; inject trusted authentication callback.
 */
import { createMcpOAuthResourceMetadata, createMcpOAuthChallenge } from './mcp-oauth-resource-metadata.mjs';
const deny = () => { throw new Error('MCP OAuth HTTP denied'); };
export function createMcpOAuthHttpGate({
  resource, issuer, metadataPath = '/.well-known/oauth-protected-resource/mcp',
  mcpPath = '/mcp', authenticateTransport,
}) {
  if (typeof authenticateTransport !== 'function' ||
      typeof metadataPath !== 'string' || typeof mcpPath !== 'string' ||
      !metadataPath.startsWith('/.well-known/oauth-protected-resource/') ||
      !/^\/[a-z0-9/_-]+$/i.test(metadataPath) ||
      !/^\/[a-z0-9/_-]+$/i.test(mcpPath) || metadataPath === mcpPath) deny();
  const resourceUrl = new URL(resource);
  if (resourceUrl.pathname !== mcpPath || resourceUrl.search || resourceUrl.hash) deny();
  const metadata = createMcpOAuthResourceMetadata({ resource, issuer });
  const metadataUri = resourceUrl.origin + metadataPath;
  const challenge = createMcpOAuthChallenge({ metadataUri });
  return Object.freeze({
    handle: async (req, res, dispatch) => {
      if (typeof dispatch !== 'function' || res.headersSent) deny();
      const path = req?.url;
      if (path === metadataPath) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
          .end(JSON.stringify(metadata));
        return;
      }
      if (path !== mcpPath) {
        res.writeHead(404, { 'cache-control': 'no-store' }).end();
        return;
      }
      // Resource metadata never accepts a client-supplied principal, token or issuer.
      // Existing MCP binding must still reauthenticate and check exact grants.
      try {
        const identity = await authenticateTransport(req);
        if (!identity || typeof identity.principalId !== 'string' ||
            !identity.principalId || identity.principalId.length > 256 ||
            !['service', 'individual'].includes(identity.kind)) deny();
      } catch {
        res.writeHead(401, { 'www-authenticate': challenge,
          'cache-control': 'no-store' }).end();
        return;
      }
      await dispatch();
    },
  });
}
