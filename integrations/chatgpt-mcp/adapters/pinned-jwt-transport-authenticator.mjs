/** Offline, pinned-key JWT bearer verifier for a trusted MCP embedding host.
 * This is NOT an OAuth server, OIDC discovery client or ChatGPT login.
 * Production must manage HTTPS JWKS refresh, secure issuance and revocation.
 */
import { createPublicKey, verify as verifySignature } from 'node:crypto';
const deny = () => { throw new Error('Agent Teams read denied'); };
const valid = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
const decode = raw => {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) deny();
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.toString('base64url') !== raw) deny();
  let out;
  try { out = JSON.parse(bytes.toString('utf8')); } catch { deny(); }
  if (!out || typeof out !== 'object' || Array.isArray(out)) deny();
  return out;
};
export function createPinnedJwtTransportAuthenticator({
  issuer, audience, publicKeys, isRevoked, requiredScope, now = () => Math.floor(Date.now() / 1000),
}) {
  if (!valid(issuer) || !valid(audience) || !publicKeys ||
      typeof publicKeys !== 'object' || Array.isArray(publicKeys) ||
      typeof isRevoked !== 'function' || typeof now !== 'function' ||
      (requiredScope !== undefined && (typeof requiredScope !== 'string' ||
        !/^[a-z][a-z0-9:-]{0,63}$/.test(requiredScope)))) deny();
  const keys = new Map();
  for (const [kid, jwk] of Object.entries(publicKeys)) {
    if (!valid(kid) || keys.size >= 16 || jwk?.kty !== 'RSA' || jwk?.alg !== 'RS256' ||
        (jwk?.use !== undefined && jwk.use !== 'sig') || jwk?.d !== undefined) deny();
    try {
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength < 2048) deny();
      keys.set(kid, key);
    } catch { deny(); }
  }
  if (!keys.size) deny();
  return async request => {
    const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request?.headers?.authorization ?? '');
    if (!bearer || bearer[1].length > 16384) deny();
    const segments = bearer[1].split('.');
    if (segments.length !== 3) deny();
    const [h, p, s] = segments;
    const header = decode(h), claims = decode(p);
    if (header.alg !== 'RS256' || !valid(header.kid) || !keys.has(header.kid) ||
        header.typ !== 'JWT' || header.crit !== undefined) deny();
    if (!/^[A-Za-z0-9_-]+$/.test(s)) deny();
    const signature = Buffer.from(s, 'base64url');
    if (signature.toString('base64url') !== s ||
        !verifySignature('RSA-SHA256', Buffer.from(h + '.' + p), keys.get(header.kid), signature)) deny();
    const time = now();
    if (!Number.isSafeInteger(time) || claims.iss !== issuer ||
        claims.aud !== audience || !valid(claims.sub) || !valid(claims.jti) ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > time || claims.nbf > time || claims.exp <= time ||
        claims.exp <= claims.iat || claims.exp - claims.iat > 3600 ||
        claims.nbf < claims.iat || claims.token_use !== 'access' ||
        (requiredScope !== undefined && (typeof claims.scope !== 'string' ||
          !claims.scope.split(' ').includes(requiredScope)))) deny();
    let revoked;
    try { revoked = await isRevoked({ issuer: claims.iss, subject: claims.sub, tokenId: claims.jti }); }
    catch { deny(); }
    if (revoked !== false) deny();
    const principalId = claims.iss + '#' + claims.sub;
    if (!valid(principalId)) deny();
    return { principalId, kind: 'individual' };
  };
}
