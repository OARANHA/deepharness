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
