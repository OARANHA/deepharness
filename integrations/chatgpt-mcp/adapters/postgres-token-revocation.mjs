/** Durable PostgreSQL revocation backend adapter.
 * The trusted operator must provision the schema, secure DB credentials and
 * a strongly consistent primary connection. No in-memory not-revoked cache.
 * All storage errors deny authorization through authoritative check wrapper.
 */
import { createHash } from 'node:crypto';
import { createAuthoritativeRevocationCheck } from './authoritative-revocation-check.mjs';
const deny = () => { throw new Error('Agent Teams read denied'); };
const valid = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
const digest = (issuer, subject, tokenId) => createHash('sha256')
  .update(JSON.stringify([issuer, subject, tokenId])).digest('hex');
export function createPostgresRevocationBackend({ query, timeoutMs = 1000 }) {
  if (typeof query !== 'function') deny();
  const lookup = async ({ issuer, subject, tokenId }, { signal }) => {
    if (![issuer, subject, tokenId].every(valid)) deny();
    // A direct primary query avoids replica lag and stale authorization.
    const result = await query(
      'SELECT revoked FROM chatgpt_mcp_token_revocations WHERE token_hash = $1',
      [digest(issuer, subject, tokenId)], { signal, readFromPrimary: true },
    );
    if (!Array.isArray(result?.rows) || result.rows.length > 1) deny();
    // Absence means no revoked record only under an authoritative, healthy
    // persistent primary. Reject ambiguous/malformed DB results.
    if (result.rows.length === 0) return false;
    if (result.rows[0]?.revoked !== true) deny();
    return true;
  };
  const isRevoked = createAuthoritativeRevocationCheck({ lookup, timeoutMs });
  return Object.freeze({ isRevoked });
}
