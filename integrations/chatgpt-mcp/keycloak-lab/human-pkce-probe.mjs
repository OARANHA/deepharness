/** Disposable browser-equivalent Keycloak login form + code/PKCE contract test.
 * Runs only on runner loopback; does not log credentials, codes or access tokens.
 * Not a real ChatGPT/browser sign-in or production security proof.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
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
const wrong = await exchange('wrong-verifier');
assert.equal(wrong.status, 400, 'wrong PKCE proof must fail');
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
assert.ok(claims.sub);
assert.ok(Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp));
assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 3600);
const reused = await exchange(verifier);
assert.equal(reused.status, 400, 'authorization code replay must be denied');
console.log('KEYCLOAK_HUMAN_PKCE_PROFILE_MATCH: code + S256 + state + resource audience + read scope + one-time exchange');
