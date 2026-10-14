/** Node-only HTTPS OIDC fetcher, DNS-pinned per fresh TCP socket.
 * No proxies, redirect following, keepalive pool, or reusable DNS verdicts.
 * TLS SNI and certificate hostname remain the original server hostname.
 */
import https from 'node:https';
import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolvePublicOidcAddresses } from './oidc-egress-address-policy.mjs';

const deny = () => { throw new Error('OIDC pinned HTTPS denied'); };
export function createDnsPinnedOidcFetcher({
  lookup = systemLookup, maxBytes = 65536, timeoutMs = 3000,
} = {}) {
  if (typeof lookup !== 'function' || !Number.isInteger(maxBytes) ||
      maxBytes < 1024 || maxBytes > 131072 || !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 || timeoutMs > 10000) deny();
  return async (uri, options = {}) => {
    let url;
    try { url = new URL(uri); } catch { deny(); }
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.hash || url.search || url.href !== uri ||
        isIP(url.hostname) !== 0 || url.port && url.port !== '443' ||
        !/^[a-z0-9.-]{1,253}$/i.test(url.hostname)) deny();
    if (options.redirect !== 'error' || options.cache !== 'no-store' ||
        options.method && options.method !== 'GET') deny();
    const signal = options.signal;
    if (signal?.aborted) deny();
    try {
      return await new Promise((resolve, reject) => {
        let ended = false;
        const finish = (error, response) => {
          if (ended) return;
          ended = true;
          if (error) reject(error); else resolve(response);
        };
        const req = https.request(url, {
          method: 'GET', agent: false, servername: url.hostname,
          rejectUnauthorized: true, timeout: timeoutMs, signal,
          headers: { accept: 'application/json', connection: 'close' },
          lookup: (hostname, opts, callback) => {
            resolvePublicOidcAddresses(hostname, lookup).then(addresses => {
              // Node explicitly connects to this approved IP; it does NOT
              // resolve hostname again after the policy check.
              const address = addresses[0];
              const family = isIP(address);
              callback(null, opts?.all ? [{ address, family }] : address,
                opts?.all ? undefined : family);
            }, () => callback(new Error('OIDC DNS denied')));
          },
        }, res => {
          if (res.statusCode !== 200) { res.resume(); finish(new Error('OIDC status denied')); return; }
          const length = res.headers['content-length'];
          if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
            req.destroy(); finish(new Error('OIDC size denied')); return;
          }
          let total = 0;
          const chunks = [];
          res.on('data', chunk => {
            total += chunk.length;
            if (total > maxBytes) {
              req.destroy();
              finish(new Error('OIDC size denied'));
            } else chunks.push(chunk);
          });
          res.on('end', () => {
            if (ended) return;
            const headers = { 'content-type': res.headers['content-type'] ?? '' };
            finish(null, new Response(Buffer.concat(chunks), { status: 200, headers }));
          });
          res.on('error', error => finish(error));
        });
        req.on('timeout', () => req.destroy(new Error('OIDC timeout')));
        req.on('error', error => finish(error));
        req.end();
      });
    } catch { deny(); }
  };
}
