/** Fail-closed validation of externally fetched OIDC discovery + JWKS data.
 * No network calls, redirects, discovery URLs from tokens, or implicit trust.
 * The embedding server must pin the expected HTTPS issuer and fetch documents
 * through a separately reviewed egress, timeout and caching layer.
 */
const deny = () => { throw new Error('OIDC trust metadata denied'); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exactHttps = value => {
  if (typeof value !== 'string' || value.length > 2048) deny();
  let url;
  try { url = new URL(value); } catch { deny(); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.href !== value) deny();
  return url;
};
export function validatePinnedOidcMetadata({ issuer, discovery, jwks, allowedJwksUri }) {
  const expected = exactHttps(issuer);
  if (expected.pathname.includes('/../') || expected.pathname.includes('/./')) deny();
  if (!object(discovery) || discovery.issuer !== issuer ||
      !Array.isArray(discovery.id_token_signing_alg_values_supported) ||
      !discovery.id_token_signing_alg_values_supported.includes('RS256')) deny();
  const uri = exactHttps(discovery.jwks_uri);
  if (uri.href !== allowedJwksUri || uri.origin !== expected.origin) deny();
  if (!object(jwks) || !Array.isArray(jwks.keys) ||
      jwks.keys.length < 1 || jwks.keys.length > 16) deny();
  const keys = Object.create(null);
  for (const key of jwks.keys) {
    if (!object(key) || typeof key.kid !== 'string' ||
        key.kid.length < 1 || key.kid.length > 256 ||
        Object.hasOwn(keys, key.kid) || key.kty !== 'RSA' || key.alg !== 'RS256' ||
        (key.use !== undefined && key.use !== 'sig') ||
        typeof key.n !== 'string' || typeof key.e !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(key.n) || !/^[A-Za-z0-9_-]+$/.test(key.e) ||
        Object.keys(key).some(field => ['d','p','q','dp','dq','qi','oth','k'].includes(field))) deny();
    keys[key.kid] = { kty: 'RSA', alg: 'RS256', use: 'sig',
      n: key.n, e: key.e };
  }
  return Object.freeze({ issuer, publicKeys: Object.freeze(keys) });
}
