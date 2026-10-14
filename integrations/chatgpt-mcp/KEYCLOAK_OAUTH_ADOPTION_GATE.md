# Keycloak OAuth adoption gate — ChatGPT ↔ DeepHarness MCP

Decision (2026-10-14): **conditional candidate, NOT approved for deploy**.

## Evidence and rationale
- Official ChatGPT plugin auth docs: https://developers.openai.com/plugins/build/auth
  ChatGPT supports OAuth authorization code + PKCE S256, protected resource metadata,
  client identification via CIMD, dynamic client registration (DCR) or pre-registered client.
  Resource indicator must be echoed through authorization and token flows.
- Keycloak's MCP integration guide: https://www.keycloak.org/securing-apps/mcp-authz-server
  Supports PKCE, discovery and DCR. RFC 8707 resource indicators and CIMD are
  **experimental** and require explicit opt-in feature configuration.
- ZITADEL's documented current DCR behavior does not narrow access-token audience
  from the OAuth resource parameter; not selected as initial direct-JWT issuer:
  https://zitadel.com/docs/guides/integrate/dynamic-client-registration

## NON-NEGOTIABLE GO checks — evidence required from actual chosen Keycloak build
1. Record a fixed version, documented startup feature flags, vulnerability
   review and rollback plan. No installation without owner approval.
2. Verify HTTPS issuer metadata, `registration_endpoint` (if DCR used),
   PKCE S256 and token endpoint auth method compatible with ChatGPT.
3. For real ChatGPT client registration prefer a **pre-registered client**
   initially, with an exact callback URI obtained from the ChatGPT connection
   UI; review CIMD/DCR separately instead of turning on anonymous DCR.
4. Verify RFC 8707 `resource` is honored on authorization and token exchange:
   a JWT **access token** (not an ID token) has the exact canonical MCP URI as
   its sole audience string, `token_use=access`, signed RS256, `kid`,
   `iss`, `sub`, `jti`, `iat`, `nbf`, `exp`, and `scope` containing
   `agent-teams:read`, all matching current strict pinned JWT verifier.
   Keycloak may not issue this token profile by default. Do **not** weaken
   verifier or fabricate claims to force compatibility. Document required
   audited protocol mappers or use a separately reviewed compatible issuer.
5. Confirm authorization is denied for wrong `resource`, missing scope,
   wrong `aud`, unknown principal, cross-workspace or detached Lead.
6. Each verified user identity `issuer#sub` maps to separately provisioned
   exact read grants, never to the whole DSH workspace by default.
7. Production revocation must be authoritative on every MCP request,
   centrally persisted on PostgreSQL primary with tested availability,
   recovery, and access-token expiry/revocation semantics. The app-side
   revocation table alone cannot detect Keycloak session logout unless
   coordinated revocation or appropriately short token lifetime is proved.
8. Verify DNS-pinned HTTPS JWKS, origin TLS chain, egress firewall and ingress
   authorization; run an owner-controlled one-team read-only canary using
   actual ChatGPT after explicit owner approval.

## Current outcome
**NO-GO** pending actual provider token contract, ingress/TLS,
persistent revocation, admin-provisioned user grant, and real ChatGPT login.
Do not install Keycloak, change VPS, enable anonymous DCR/CIMD experimental
features, create DNS, expose ports, merge PR, or deploy automatically.
