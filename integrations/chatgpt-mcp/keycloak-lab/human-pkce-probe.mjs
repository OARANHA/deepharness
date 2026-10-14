/** Disposable browser-equivalent Keycloak login form + code/PKCE contract test.
 * Runs only on runner loopback; does not log credentials, codes or access tokens.
 * Not a real ChatGPT/browser sign-in or production security proof.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';
import { createMcpReadRequestContext } from '../adapters/mcp-read-request-context.mjs';
const base = process.env.KEYCLOAK_LAB_URL ?? 'http://127.0.0.1:18080';
const issuer = base + '/realms/deepharness-mcp-lab';
const resource = 'https://mcp.example/mcp';
const callback = 'http://127.0.0.1:18081/callback';
const username = 'lab-human';
const password = process.env.KEYCLOAK_LAB_HUMAN_PASSWORD;
if (!password || password.length < 24) throw Error('Missing ephemeral human lab password');
const json = await (await fetch(issuer + '/.well-known/openid-configuration')).json();
assert.equal(json.issuer, issuer);
assert.ok(json.code_challenge_methods_supported.includes('S256'));
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('base64url');
const uri = new URL(json.authorization_endpoint);
for (const [k,v] of Object.entries({
  client_id: 'mcp-pkce-human-probe', response_type: 'code',
  redirect_uri: callback, scope: 'agent-teams:read', resource,
  state, code_challenge: challenge, code_challenge_method: 'S256',
})) uri.searchParams.set(k,v);
const start = await fetch(uri, { redirect: 'manual' });
assert.equal(start.status, 200, 'Keycloak must render a login challenge (not silently issue a token)');
const cookie = start.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
assert.ok(cookie, 'authorization state cookie required');
const html = await start.text();
const match = html.match(/<form\b[^>]*\bid=["']kc-form-login["'][^>]*\baction=["']([^"']+)["']/i) ||
  html.match(/<form\b[^>]*\baction=["']([^"']+)["'][^>]*\bid=["']kc-form-login["']/i);
if (!match) throw Error('Keycloak browser login form not found (refuse automatic fallback)');
const action = match[1].replaceAll('&amp;', '&');
const loginUrl = new URL(action, issuer);
assert.equal(loginUrl.origin, new URL(base).origin, 'never submit credentials outside loopback Keycloak');
const login = await fetch(loginUrl, { method: 'POST', redirect: 'manual',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username, password, credentialId: '' }),
});
if (![302,303].includes(login.status)) throw Error('Keycloak lab human login denied; HTTP ' + login.status);
const location = login.headers.get('location');
if (!location) throw Error('Missing authorization callback');
const redirect = new URL(location, issuer);
assert.equal(redirect.origin + redirect.pathname, callback, 'callback must be exact configured URI');
assert.equal(redirect.searchParams.get('state'), state, 'OAuth state mismatch');
assert.equal(redirect.searchParams.get('error'), null, 'OAuth authz failed');
const code = redirect.searchParams.get('code');
assert.ok(code, 'authorization code missing');
async function exchange(codeVerifier) {
  return fetch(json.token_endpoint, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'mcp-pkce-human-probe',
      code, code_verifier: codeVerifier, redirect_uri: callback, resource }),
  });
}
// Exchange the valid code first. Keycloak can invalidate a code after a
// failed PKCE redemption; probing a wrong verifier on that same code first
// would make the positive path untestable.
const ok = await exchange(verifier);
assert.equal(ok.status, 200, 'valid S256 PKCE code exchange must succeed');
const access = (await ok.json()).access_token;
assert.equal(typeof access, 'string');
const segments = access.split('.');
assert.equal(segments.length, 3);
const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
assert.equal(claims.iss, issuer);
assert.equal(claims.aud, resource);
assert.equal(claims.token_use, 'access');
assert.ok(claims.scope.split(' ').includes('agent-teams:read'));
assert.ok(typeof claims.sub === 'string' && claims.sub.length > 0, 'human access token must carry issuer-managed subject');
assert.ok(Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp));
assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 3600);
const reused = await exchange(verifier);
assert.equal(reused.status, 400, 'authorization code replay must be denied');
// Full local path: Keycloak-issued JWT -> validated signature/claims ->
// transport-bound individual subject -> exact workspace+Lead grant -> read.
// The DSH projection below is deliberately fixture-only; no live DSH read.
const discoveryJwks = await fetch(json.jwks_uri);
assert.equal(discoveryJwks.status, 200, 'issuer JWKS endpoint required');
const jwks = await discoveryJwks.json();
const head = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
assert.equal(head.alg, 'RS256');
assert.equal(head.typ, 'JWT');
assert.ok(typeof head.kid === 'string' && head.kid.length);
const signingKey = jwks.keys?.find(k => k.kid === head.kid && k.kty === 'RSA');
assert.ok(signingKey, 'matching issuer RSA signing key required');
const keys = { [head.kid]: { ...signingKey, alg: 'RS256' } };
const clock = () => Math.floor(Date.now() / 1000);
const revokedTokens = new Set();
const authenticated = createPinnedJwtTransportAuthenticator({
  issuer, audience: resource, publicKeys: keys, requiredScope: 'agent-teams:read',
  allowMissingNotBefore: true, now: clock,
  isRevoked: async ({tokenId}) => revokedTokens.has(tokenId),
});
const request = {headers: { authorization: 'Bearer ' + access, origin: 'http://127.0.0.1:18081' }};
const principal = issuer + '#' + claims.sub;
const scope = {principalId:principal,workspaceId:'lab-workspace',leadSessionId:'lab-lead-allowed'};
let projections = 0;
const binding = createMcpReadRequestContext({
  authenticateTransport: authenticated,
  allowedOrigins: ['http://127.0.0.1:18081'],
  grants: [scope],
  workspaceRegistry: {get(id) { return id === 'lab-workspace'
    ? {id,sessionIds:['lab-lead-allowed','lab-lead-denied']} : undefined; }},
  resolveLiveLeadSession: async id => ({id}),
  sessionProjections: {snapshot() { projections++;
    return {values:{agentTeam:{members:[{id:'lab-lead-allowed',name:'fixture-lead',role:'lead',phase:'active'}],tasks:[]}}};
  }},
});
const read = (target, req=request) => binding.runHttpRequest(req, () => binding.readTeam(target));
const allowed = {workspaceId:'lab-workspace',leadSessionId:'lab-lead-allowed'};
const denied = {workspaceId:'lab-workspace',leadSessionId:'lab-lead-denied'};
assert.equal((await authenticated(request)).principalId, principal, 'signed sub determines individual principal');
assert.equal((await read(allowed)).leadSessionId, allowed.leadSessionId);
const beforeDenied = projections;
await assert.rejects(read(denied), /denied/, 'workspace membership must not authorize a different Lead');
assert.equal(projections, beforeDenied, 'unauthorized team projection must not be read');
await assert.rejects(read({...allowed,principalId:principal,workspaceId:'other-workspace'}), /denied/);
await assert.rejects(read(allowed,{headers:{authorization:'Bearer invalid',origin:'http://127.0.0.1:18081'}}), /denied/);
revokedTokens.add(claims.jti);
await assert.rejects(read(allowed), /denied/, 'revoked real token must not read an authorized Lead');
console.log('KEYCLOAK_HUMAN_GRANTS_E2E_MATCH: real signed JWT + issuer sub + exact grants + denied other Lead + revocation; DSH data fixture only');
console.log('KEYCLOAK_HUMAN_PKCE_PROFILE_MATCH: code + S256 + state + resource audience + read scope + one-time exchange');
