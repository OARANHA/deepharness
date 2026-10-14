/** Revalidate every MCP request against the currently trusted JWKS snapshot.
 * No unknown-kid network fetch, stale-key fallback, or JWT-triggered rotation.
 * The provided discovery client owns bounded refresh and expiry enforcement.
 */
import { createPinnedJwtTransportAuthenticator } from './pinned-jwt-transport-authenticator.mjs';

const deny = () => { throw new Error('Agent Teams read denied'); };
export function createRotatingJwksTransportAuthenticator({
  discovery, audience, isRevoked, requiredScope, now = () => Math.floor(Date.now() / 1000),
}) {
  if (typeof discovery?.get !== 'function' || typeof audience !== 'string' ||
      !audience || typeof isRevoked !== 'function' || typeof now !== 'function') deny();
  return async request => {
    let snapshot;
    try { snapshot = await discovery.get(); } catch { deny(); }
    if (!snapshot || typeof snapshot.issuer !== 'string' || !snapshot.publicKeys) deny();
    // Construct from this exact immutable snapshot on every check. This
    // prevents caching a removed kid or a replaced public key after rotation.
    let verify;
    try {
      verify = createPinnedJwtTransportAuthenticator({
        issuer: snapshot.issuer, audience, publicKeys: snapshot.publicKeys, isRevoked, requiredScope, now,
      });
    } catch { deny(); }
    try { return await verify(request); } catch { deny(); }
  };
}
