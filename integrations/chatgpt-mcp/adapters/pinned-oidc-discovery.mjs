/** Pinned OIDC HTTPS metadata fetcher. Trusted deployment must enforce network
 * a restricted egress firewall and TLS interception/proxy controls separately.
 * Never derive issuer or JWKS endpoints from a token or user input.
 */
import { validatePinnedOidcMetadata } from './pinned-oidc-metadata.mjs';
import { createDnsPinnedOidcFetcher } from './dns-pinned-oidc-fetcher.mjs';
const deny = () => { throw new Error('OIDC discovery denied'); };
export function createPinnedOidcDiscovery({
  issuer, discoveryUri, jwksUri, fetcher = createDnsPinnedOidcFetcher(),
  now = () => Date.now(), timeoutMs = 3000, ttlMs = 60000,
  maxBytes = 65536,
}) {
  const trusted = uri => {
    if (typeof uri !== 'string') deny();
    let url;
    try { url = new URL(uri); } catch { deny(); }
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || url.href !== uri || url.origin !== new URL(issuer).origin) deny();
    return uri;
  };
  if (typeof issuer !== 'string' || !issuer.startsWith('https://') ||
      typeof fetcher !== 'function' || typeof now !== 'function' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000 ||
      !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 131072) deny();
  trusted(discoveryUri); trusted(jwksUri);
  const expectedDiscovery = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  if (discoveryUri !== expectedDiscovery) deny();
  let cached, expiresAt = 0, inflight;
  const read = async uri => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(uri, { redirect: 'error', signal: controller.signal,
        headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response || response.status !== 200 ||
          typeof response.headers?.get !== 'function' ||
          !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) deny();
      const size = response.headers.get('content-length');
      if (size !== null && (!/^\d+$/.test(size) || Number(size) > maxBytes)) deny();
      if (!response.body?.getReader) deny();
      const reader = response.body.getReader();
      const chunks = []; let count = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          count += value.byteLength;
          if (count > maxBytes) deny();
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const bytes = Buffer.concat(chunks.map(x => Buffer.from(x)));
      let value;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { deny(); }
      return value;
    } catch { deny(); }
    finally { clearTimeout(timeout); }
  };
  const refresh = async () => {
    const discovery = await read(discoveryUri);
    // Do not issue a second request until discovery metadata matches pinned URI.
    if (discovery?.issuer !== issuer || discovery?.jwks_uri !== jwksUri) deny();
    const jwks = await read(jwksUri);
    const verified = validatePinnedOidcMetadata({
      issuer, discovery, jwks, allowedJwksUri: jwksUri,
    });
    // Atomic replacement: never mix old keys and new provider metadata.
    cached = verified;
    expiresAt = now() + ttlMs;
    return verified;
  };
  return Object.freeze({
    get: async () => {
      if (cached && now() < expiresAt) return cached;
      if (!inflight) inflight = refresh().finally(() => { inflight = undefined; });
      return inflight;
    },
    // Forced refresh is intended for planned key rollover, never kid-driven
    // unbounded requests. Concurrent refreshes coalesce.
    refresh: async () => {
      if (!inflight) inflight = refresh().finally(() => { inflight = undefined; });
      return inflight;
    },
  });
}
