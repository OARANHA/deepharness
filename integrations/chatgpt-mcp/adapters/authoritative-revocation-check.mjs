/** Revocation decision from a trusted authoritative store, fail closed.
 * The embedding server owns persistence, authentication to the store and
 * distribution of revocation events. In-memory deny lists are NOT sufficient.
 */
const deny = () => { throw new Error('Agent Teams read denied'); };
export function createAuthoritativeRevocationCheck({ lookup, timeoutMs = 1000 }) {
  if (typeof lookup !== 'function' || !Number.isInteger(timeoutMs) ||
      timeoutMs < 50 || timeoutMs > 5000) deny();
  return async ({ issuer, subject, tokenId }) => {
    if (![issuer, subject, tokenId].every(v =>
      typeof v === 'string' && v.length > 0 && v.length <= 256)) deny();
    const ctrl = new AbortController();
    let timeout;
    try {
      const pending = Promise.resolve().then(() =>
        lookup(Object.freeze({ issuer, subject, tokenId }), { signal: ctrl.signal }));
      const result = await Promise.race([pending,
        new Promise((_, reject) => {
          timeout = setTimeout(() => { ctrl.abort(); reject(new Error('unavailable')); }, timeoutMs);
        })]);
      // Only the authoritative explicit NOT-revoked result authorizes.
      if (result !== false) deny();
      return false;
    } catch { deny(); }
    finally { clearTimeout(timeout); }
  };
}
