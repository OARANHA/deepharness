/** DNS/IP policy for a trusted OIDC HTTPS connector.
 * DNS checks alone are insufficient: the HTTP transport MUST connect to the
 * exact validated address while preserving hostname TLS/SNI and certificate
 * verification. Never use default fetch() as proof of DNS pinning.
 */
import { isIP } from 'node:net';
const deny = () => { throw new Error('OIDC egress denied'); };
export function assertPublicOidcAddress(address) {
  if (typeof address !== 'string' || isIP(address) === 0) deny();
  if (isIP(address) === 4) {
    const a = address.split('.').map(Number);
    if (a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
        a[0] === 169 && a[1] === 254 ||
        a[0] === 172 && a[1] >= 16 && a[1] <= 31 ||
        a[0] === 192 && a[1] === 168 ||
        a[0] === 100 && a[1] >= 64 && a[1] <= 127 ||
        a[0] === 192 && a[1] === 0 ||
        a[0] === 192 && a[1] === 88 && a[2] === 99 ||
        a[0] === 198 && (a[1] === 18 || a[1] === 19) ||
        a[0] === 192 && a[1] === 0 && a[2] === 2 ||
        a[0] === 198 && a[1] === 51 && a[2] === 100 ||
        a[0] === 203 && a[1] === 0 && a[2] === 113) deny();
    return address;
  }
  const lower = address.toLowerCase();
  // Conservative fail-closed IPv6 policy: only native global unicast,
  // excluding unique-local, documentation and IPv4-mapped addresses.
  if (!lower.includes(':') || lower.includes('.') || lower.startsWith('fc') ||
      lower.startsWith('fd') || lower.startsWith('fe') || lower.startsWith('ff') ||
      lower.startsWith('2001:db8:') || lower.startsWith('::') ||
      !/^[23]/.test(lower)) deny();
  return address;
}
export async function resolvePublicOidcAddresses(hostname, lookup) {
  if (typeof hostname !== 'string' || !/^[a-z0-9.-]{1,253}$/i.test(hostname) ||
      typeof lookup !== 'function') deny();
  let records;
  try { records = await lookup(hostname, { all: true, verbatim: true }); }
  catch { deny(); }
  if (!Array.isArray(records) || records.length < 1 || records.length > 16) deny();
  const addresses = [];
  for (const entry of records) {
    if (!entry || (entry.family !== 4 && entry.family !== 6)) deny();
    addresses.push(assertPublicOidcAddress(entry.address));
  }
  return Object.freeze([...new Set(addresses)]);
}
