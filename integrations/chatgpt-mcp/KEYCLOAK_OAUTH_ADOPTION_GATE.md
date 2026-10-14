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

## RFC 7519-compatible `nbf` interoperability (2026-10-14)

Verified RFC 7519 §4.1.5: the `nbf` (not-before) claim is OPTIONAL.
Keycloak 26.8.0 lab access JWT has no `nbf` by default. We do NOT
fabricate `nbf` or use static timestamps. The verifier now supports
`allowMissingNotBefore: true` **only if explicitly set by the trusted
embedding server**. Default remains false. If `nbf` is included,
its value must be a safe integer, not precede `iat`, and not be
later than verifier time. Regardless of this option, signed JWT,
pinned issuer, exact audience, access token purpose, required scope,
`iat <= now`, `exp > now`, bounded lifetime, and authoritative
revocation remain mandatory. The rotating JWKS adapter forwards
the option. A regression test covers absent and malicious present
`nbf`, expired and future-issued tokens.

The disposable Keycloak profile probe now accepts missing `nbf` only
under this temporal policy, and continues to fail the workflow on
any other contract mismatch. This isolated service-account lab does not
prove authorization-code PKCE for a real ChatGPT human user; no OAuth
provider connection or production deployment has been approved.
New CI **pending**. Production **NO-GO**.
Reference: https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1.5

## Human-user authorization code + PKCE lab gate (2026-10-14)

The disposable realm now includes a one-off `lab-human` user with a
fresh random password generated only in GitHub Actions, and a public
`mcp-pkce-human-probe` OAuth client pinned to a loopback callback with
PKCE S256. The `human-pkce-probe.mjs` script exercises the actual
Keycloak login HTML form and authorization-code/token endpoints with
temporary state and verifier, and fails on absent login challenge,
cross-origin form action, wrong callback/state, wrong PKCE rejection,
missing signed-access-token scope/resource claims or successful code
replay. It does not log passwords, codes, bearer tokens or identities.

**Scope limitation:** scripted form submission is not a full browser
or ChatGPT client. It is a disposable HTTP-based lab; Keycloak themes,
required user actions or login CSRF-cookie flows may require adapting
the test. A lab GREEN would establish only this issuer's human code +
PKCE behavior, not real ChatGPT registration, real TLS, hosted OAuth,
or persistent revocation. New CI is pending; no production activation.

## Human PKCE redemption ordering correction (2026-10-14)
The prior RED (Keycloak run 38515665052) reached the correct human OAuth callback, but token redemption returned HTTP 400 after the test intentionally attempted a wrong code verifier on the SAME authorization code. Some issuers consume/invalidates that code on failed proof. The lab now performs the valid redemption first and verifies replay denial. A **separate independently issued code** is needed for a conclusive negative wrong-verifier test; do not describe the current lab as proving that negative case. New CI pending; no production approval.

## Human subject claim mapping correction (2026-10-14)
The RED in Keycloak lab run 38516025537 showed that the human authorization-code+PKCE token exchange succeeded, but the access JWT lacked `sub`. Keycloak >=25 produces the access-token subject through the `Subject (sub)` protocol mapper, normally attached to the built-in `basic` client scope. The lab human client had explicitly replaced its defaults with only `agent-teams:read`. Restored `basic` **in addition to** `agent-teams:read` for that client. We do not mint a fake subject or derive identity from username/email; MCP still requires the issuer-issued signed `sub`, exact audience, scoped token and principal/Lead grants. Await renewed lab CI; no proof until result is GREEN with human PKCE profile match. Reference: Keycloak 25 upgrade notes (https://github.com/keycloak/keycloak/blob/main/docs/documentation/upgrading/topics/changes/changes-25_0_0.adoc).

## Explicit issuer-managed human `sub` mapper (2026-10-14)
Run 38516673419 remained RED after adding `basic` to the human-client default scopes: OAuth code exchange succeeded but human access JWT had no `sub`. The disposable client now explicitly attaches Keycloak's built-in `oidc-sub-mapper` to its access tokens; this derives the subject from the authenticated Keycloak user session. It does NOT invent a subject or substitute username/email. The profile test requires a nonempty string `sub` and retains exact audience, access purpose, scope, PKCE and replay checks. No proof of success until the new CI passes. See https://www.keycloak.org/admin-api/protocol-mappers.
