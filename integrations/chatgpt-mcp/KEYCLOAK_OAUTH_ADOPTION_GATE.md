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

## Disposable real-Keycloak token-profile laboratory (2026-10-14)

Added `keycloak-lab/realm.json`, `keycloak-lab/probe.mjs` and
`.github/workflows/chatgpt-mcp-keycloak-lab.yml`. The workflow is
**manual only** (`workflow_dispatch`); it is not a production rollout.
It launches a pinned `quay.io/keycloak/keycloak:26.8.0` container
with experimental `resource-indicators` on runner loopback only,
imports an ephemeral realm with a service-account probe client,
and inspects the shape of a **real Keycloak-issued access JWT** without
printing the token or credentials. CI creates fresh random lab admin
and client secrets and discards the container. A service-account token
is intentionally not proof of ChatGPT browser login or human grants.

The probe reports explicit `KEYCLOAK_CONTRACT_NO_GO` if fields or
audience fail the exact current JWT profile. **The probe intentionally
does not fail CI solely for incompatibility**: success means evidence
was collected, NOT that OAuth is production compatible.
Review the log's profile result separately before proceeding.
In particular, default Keycloak claims may omit `token_use`, `nbf`
or an `agent-teams:read` scope; do not relax authorization to green
the experiment. A full browser flow and human subject authorization
still requires a separate explicit gate. This lab has **not been run**.
GitHub may require workflow_dispatch workflow registration on the
default branch before the manual run is selectable: do not merge a
draft PR merely to enable the button; use an approved isolated test
branch/workflow mechanism instead.

## CI trigger update (2026-10-14)
The disposable Keycloak laboratory now also uses a narrowly scoped `pull_request` trigger for changes to its workflow or `keycloak-lab/**` files. This avoids reliance on the GitHub Actions manual dispatch UI (which may require a workflow registered on the default branch). It does not deploy, merge, install on the VPS, or prove ChatGPT login. Read the **KEYCLOAK_LAB_PROFILE** / **KEYCLOAK_CONTRACT_NO_GO** diagnostics even if the workflow itself turns green: a technically successful lab with incompatible JWT fields is still NO-GO. Lab CI outcome pending.

## Keycloak token mapper / strict CI experiment (2026-10-14)

Lab realm updated with an explicit `agent-teams:read` client scope (assigned to
the disposable service-account client) and an OIDC hardcoded-claim protocol
mapper on access tokens only for `token_use=access`. The previous lab had
correct RS256 and exact resource audience but lacked `nbf`, `token_use`
and `agent-teams:read` in the issued access token.

The lab probe now returns a non-zero exit code whenever real token claims
do not match the strict existing verifier. **A RED Keycloak lab may be the
correct safe outcome.** Do not insert a constant `nbf` using a hardcoded
claim mapper: it must be generated as a meaningful token not-before time,
not a shared static timestamp. No claim is manufactured inside the
resource server. The lab's client-credentials path tests only token shape,
not PKCE browser grants for human users, and a hardcoded purpose claim
must not be applied indiscriminately to ID tokens or unrelated clients.

Next: inspect actual Keycloak profile diagnostics and identify an audited
issuer-side way to satisfy `nbf` or document a separate, security-reviewed
JWT claim-policy change. Until then the Keycloak access JWT is **NO-GO**.
