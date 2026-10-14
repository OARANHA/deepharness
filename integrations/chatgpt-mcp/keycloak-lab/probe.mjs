/** Disposable Keycloak profile inspection: never logs JWT, client secret or user claims. */
const base = process.env.KEYCLOAK_LAB_URL ?? 'http://127.0.0.1:18080';
const realm = 'deepharness-mcp-lab';
const resource = 'https://mcp.example/mcp';
const endpoint = base + '/realms/' + realm;
const required = ['iss', 'aud', 'sub', 'jti', 'iat', 'nbf', 'exp', 'token_use', 'scope'];
const timeout = AbortSignal.timeout(10000);
const metadataRes = await fetch(endpoint + '/.well-known/openid-configuration', { signal: timeout });
if (!metadataRes.ok) throw Error('Keycloak discovery unavailable');
const metadata = await metadataRes.json();
if (metadata.issuer !== endpoint) throw Error('Keycloak issuer mismatch');
if (!metadata.code_challenge_methods_supported?.includes('S256')) throw Error('Keycloak S256 unsupported');
const tokenRes = await fetch(metadata.token_endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials',
    client_id: 'mcp-ci-probe', client_secret: process.env.KEYCLOAK_LAB_CLIENT_SECRET ?? '',
    resource }),
  signal: AbortSignal.timeout(10000),
});
if (!tokenRes.ok) {
  console.log('KEYCLOAK_CONTRACT_NO_GO: token endpoint rejected resource-bound lab request; HTTP ' + tokenRes.status);
  process.exitCode = 1; // Incompatible issuer is a failing contract, not GREEN.
} else {
  const result = await tokenRes.json();
  const token = result.access_token;
  if (typeof token !== 'string' || token.split('.').length !== 3) throw Error('Token is not JWT');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const headers = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  const presence = Object.fromEntries(required.map(k => [k, claims[k] !== undefined]));
  const exactAud = claims.aud === resource;
  const optionalNbfValid = claims.nbf === undefined ||
    (Number.isSafeInteger(claims.nbf) && claims.nbf >= claims.iat && claims.nbf <= Math.floor(Date.now() / 1000));
  const profileMatches = required.filter(k => k !== 'nbf').every(k => presence[k]) &&
    optionalNbfValid && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp) &&
    claims.iat <= Math.floor(Date.now() / 1000) && claims.exp > Math.floor(Date.now() / 1000) &&
    exactAud && claims.token_use === 'access' && headers.alg === 'RS256' &&
    typeof claims.scope === 'string' && claims.scope.split(' ').includes('agent-teams:read');
  console.log('KEYCLOAK_LAB_PROFILE: ' + JSON.stringify({
    profileMatches, claimPresence: presence, optionalNbfValid, exactResourceAudience: exactAud,
    algorithmRS256: headers.alg === 'RS256', hasReadScope: typeof claims.scope === 'string' &&
      claims.scope.split(' ').includes('agent-teams:read'),
  }));
  console.log(profileMatches ? 'KEYCLOAK_LAB_PROFILE_MATCH — still NOT real ChatGPT login' :
    'KEYCLOAK_CONTRACT_NO_GO — real provider requires reviewed token-profile adaptation');
  if (!profileMatches) process.exitCode = 1;
}
