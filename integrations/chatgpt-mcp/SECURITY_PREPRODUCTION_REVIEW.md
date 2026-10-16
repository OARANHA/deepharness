# ChatGPT MCP — adversarial preproduction security review

Review date: 2026-10-13. Scope: PR #4, branch `feat/chatgpt-mcp-agent-teams-read-model`.
This is a **source and isolated CI review**, not authorization to expose a production MCP endpoint.

## Verified code controls (subject to new CI)
- Incoming bearer checked by trusted server-owned authenticator; forged MCP tool identity claims are ignored.
- Exact principal/workspace/Lead grants; live workspace session membership and authorization rechecked across asynchronous projection reads.
- JWT RS256 signatures, issuer, audience, access-token purpose, expiry, revocation and bounded principal ID. Removed JWKS keys no longer authorize after refresh.
- JWKS discovery enforces HTTPS pinned URLs, limited size/timeout, atomic rotation and fail-closed expired cache.
- Node HTTPS connector validates DNS results before handing approved IP directly to socket, retains original hostname for TLS SNI/certificate validation, disables redirects and connection reuse.
- PostgreSQL backend reads authoritative primary for each revocation decision, denies DB errors and uncertain replies; ephemeral PostgreSQL 16 integration workflow previously GREEN.

## Findings and decisions
1. **FIXED IN THIS REVIEW — medium:** Non-loopback HTTP origins were accepted by the request binding configuration. Only HTTPS or explicit loopback HTTP allowed now. Add negative regression.
2. **FIXED IN THIS REVIEW — medium:** JWT composed identity `issuer#sub` could exceed the 256-character transport identity limit. Deny at token verifier before returning identity. Add regression.
3. **BLOCKER — high:** OAuth 2.1/OIDC provider and ChatGPT MCP authorization flow are not configured. Server must define discovery/resource metadata, PKCE, audience, issuer and account-to-DSH authorization policy independently. No proof of real end-user login.
4. **BLOCKER — high:** The database revocation adapter is optional; there is no deployed primary DB, migration, secret management, reliable shared connection or production wiring. GREEN isolated integration tests are not production evidence.
5. **BLOCKER — high:** TLS and SSRF egress checks are mainly code/unit doubles. Perform controlled real TLS chain/SNI verification and deny private-IP DNS/redirect attempts; check network firewall, resolver/proxy paths and IPv6 edge cases prior to network exposure.
6. **BLOCKER — high:** DSH alpha host/runtime and public ingress hardening remain distinct; verified isolated SDK host does not demonstrate securely exposed DSH Web or authenticated public MCP listener.
7. **REVIEW BEFORE RELEASE — medium:** Grant state is server-owned, in-memory and restored only from trusted configuration. Multi-instance consistency, operator audit log, revocation propagation and tenant isolation must be proven with real integration.
8. **REVIEW BEFORE RELEASE — medium:** JWT verifier allows only a pinned RS256 access-token profile and exact string audience; confirm the real provider's access-token contract, key rotation policy, jti issuance, clock skew policy and robust issuer-subject mapping.

## Go/no-go
**NO-GO for merge intended as production release, endpoint publication, login activation, migration, or VPS changes.**
Draft PR may continue to run tests and security-gate changes. Require independent operator review,
explicit owner approval, a production-grade egress policy and actual authenticated end-to-end
read-only canary before reconsidering go-live.

## OAuth 2.1/MCP discovery preparation (2026-10-13; CI unverified)

`adapters/mcp-oauth-resource-metadata.mjs` adds inert, server-owned
RFC 9728 protected-resource metadata, a 401 `WWW-Authenticate`
challenge formatter and strict validation for an allowlisted HTTPS
OAuth authorization-server metadata document (issuer, exact same-origin
authorization/token endpoints, authorization code grant and PKCE S256).
Only the `agent-teams:read` scope can be advertised in this contract.
The MCP resource server must validate access-token signature, `aud`
for its resource, expiry/revocation and bind verified issuer+subject to
existing explicit principal/workspace/Lead grants; token claims and
resource scope are **not** substitutes for a grant.

Roles: ChatGPT is the **OAuth client** and owns PKCE verifier/challenge,
state, callback and code exchange. DeepHarness MCP is the **resource
server**, NOT the OAuth authorization server. A trusted third-party IDP
must issue tokens bound to the MCP resource (RFC 8707). Never handle
ChatGPT login codes or client secrets inside MCP tool arguments.

This gate adds **no public routes**, login UI, discovery fetch, OAuth
client registration, resource indicator implementation, callback,
issuance, refresh service, IDP selection or grant provisioning. MCP
endpoint metadata/401 HTTP routing and real issuer-specific access-token
validation still require integration and approval. No OAuth login is
functional yet. Avoid claims of OAuth completion. CI pending.

## Opt-in protected-resource HTTP discovery/401 gate (2026-10-14)

`adapters/mcp-oauth-http-gate.mjs` is a **non-listening**, server-owned
HTTP adapter for a pinned MCP resource URL. It serves GET protected-resource
JSON metadata at a fixed `/.well-known/oauth-protected-resource/mcp` route,
rejects other methods, and responds to missing/invalid transport identity at
`/mcp` with HTTP 401, a Bearer `WWW-Authenticate` resource_metadata hint
and `Cache-Control: no-store`. A validated identity is passed to the
embedding host's existing MCP dispatch, which **must** reauthenticate and
recheck exact principal/workspace/Lead grants; this adapter is not a
standalone permission gate.

`mcp-oauth-http-gate.test.mjs` probes a temporary loopback HTTP server
for metadata, 401, valid dispatch, 404 and 405 behavior. Nothing is
mounted on a production listener. No real authorization server, account
login, OAuth code exchange, client registration or production resource
metadata endpoint has been configured. RFC 9728 publication under a
real MCP resource URL, resource-identifier policy and proxy/TLS mapping
require separate review. **New CI unverified. NO-GO for production.**

## Isolated mock OAuth authorization-code / PKCE / JWT / MCP test (2026-10-14)

`initialized-host-probe/mock-oauth-pkce-e2e.test.mjs` runs two ephemeral
loopback HTTP servers: a deliberately simulated authorization server
and an MCP resource endpoint using the real HTTP discovery gate,
pinned JWT transport verifier and request-scoped Agent Teams grants.
It asserts 401 discovery, the S256 challenge and one-time code exchange,
denial on wrong verifier, signed resource-audience JWT acceptance,
denial of a different workspace, and rejection after token revocation.
All keys and codes are ephemeral; nothing is deployed or exposed.

**Not proved by this test:** ChatGPT's actual OAuth client behavior,
a real provider's registration/PKCE/token profile, callback URI validation
by a third-party client, production HTTPS, durable token revocation,
real DSH-host plus OAuth in the same process, or ingress/network policy.
The AS is intentionally simulated. New CI pending; release remains NO-GO.

## Real-provider interoperability gate — signed scopes and audience (2026-10-14)

The pinned JWT authenticator now supports an **opt-in requiredScope**
setting, checked on verified access-token claims alongside its existing
issuer, exact resource audience, expiry, signature and authoritative
revocation checks. Deployments choosing OAuth bearer tokens MUST set
`requiredScope: 'agent-teams:read'` and `audience` to the exact
canonical public MCP resource URI. Neither valid scope nor signature
grants any Agent Team by itself: explicit per-principal/workspace/Lead
grants are always required.

The isolated OAuth mock tests now cover signed access tokens with wrong
scope, missing scope, wrong audience and ungranted user subjects. This is
a CI security interop gate, **not** a real provider connection. Real
provider onboarding also requires choosing supported client registration
(CIMD, DCR or pre-registered client), verified HTTPS authorization-server
metadata, accepted token profile (JWT claims and RS256), resource
indicator propagation, refresh-token policy, primary-backed revocation
and safe public ingress. The strict verifier does not accept opaque
access tokens or multi-audience lists; incompatible providers must not
be connected by weakening the guard. CI pending; NO-GO.

## First real ChatGPT read readiness — rotating JWKS scope enforcement (2026-10-14)

Security integration finding: the rotating JWKS transport verifier did
not forward the previously added opt-in `requiredScope` setting to the
underlying pinned JWT verifier. This is now fixed and covered by a
regression test that rejects absent and incorrect scopes in otherwise
signed tokens, and accepts the exact `agent-teams:read` scope.

This closes a local integration gap, **not** the external-login gate.
Operator must still select a real OAuth issuer whose **access** JWT
profile satisfies the pinned verifier, explicitly wire issuer/JWKS/
`requiredScope`/resource audience and durable revocation, and prove
real ChatGPT client authorization and safe HTTPS ingress. Do not select
an IdP merely by assuming its ID token is an access token. No production
listener or credentials configured, CI unverified, NO-GO.
