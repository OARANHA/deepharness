# Stage D — reuse and activation gate (review-only, 2026-10-16)

## Source inspection

Existing implementation is **PR #4**, draft `feat/chatgpt-mcp-agent-teams-read-model`, currently based on older `test/chatgpt-bridge-alpha-compat`. **Do not merge PR #4 wholesale into main**; it changes many files with unrelated deployment/history. Reuse through targeted cherry-picks or a new narrow branch after reconciling current `main`.

Read-only capability `dsh_read_agent_team` is described in `integrations/chatgpt-mcp/OAUTH_CONNECTION_CONTRACT.md`, with `authorization_code + PKCE S256`, exact `issuer#sub`, RS256 access JWT, `agent-teams:read`, exact audience/resource, explicit principal/workspace/Lead grants, and Postgres primary revocation fail-closed.

Existing adapters to reconcile:
- `adapters/pinned-jwt-transport-authenticator.mjs` — issuer/audience/signature/token claims
- `adapters/pinned-oidc-discovery.mjs`, `pinned-oidc-metadata.mjs`, `dns-pinned-oidc-fetcher.mjs` — trusted issuer and safe discovery
- `adapters/mcp-oauth-resource-metadata.mjs`, `mcp-oauth-http-gate.mjs` — resource discovery/challenge, secured entry
- `adapters/bearer-scoped-team-reader.mjs`, `agent-teams-read-authorization.mjs`, `dsh-agent-teams-host-reader.mjs` — identity-to-per-team read only
- `adapters/postgres-read-grants.mjs`, `authoritative-revocation-check.mjs` — operator-owned persistent read authorization and revocation.

## Reconciliation with observed Stage C runtime

Operator-proven on 28server (see `deploy/mcp/STAGE_C_LIVE_EVIDENCE_STAGE_D_GATES_20261016.md`): operational Web host, internal listener :3443, healthy grants Postgres, preserved history/Agent Teams, negative and positive mTLS checks. This does **NOT** prove production PostgreSQL grant roles/migrations, OAuth token compatibility, any real identity grant, or authenticated `dsh_read_agent_team` through ChatGPT.

Historical documents `KEYCLOAK_OAUTH_ADOPTION_GATE.md` and `SECURITY_PREPRODUCTION_REVIEW.md` say no DB/runtime were deployed *as of their dates*. Reconcile against Stage C findings; do not overwrite historical evidence with assumptions.

## Ordered next engineering slice, no 28server changes

1. Freeze the actual main/source and production image/digest. Determine which PR #4 adapters are **actually inside** the pinned running MCP host image; review an image build manifest/CI proof instead of assuming that files in PR #4 are deployed.
2. Read the production operational host and verifier source to establish exact DB grant/revocation mode and any compatibility gaps before migrations or Keycloak changes. Tests of disposable Postgres are distinct from production grants.
3. Obtain actual Keycloak realm discovery and real-user token profile via private, secret-safe diagnostics. Verify `iss`, `sub`, `aud`, `jti`, `iat`, `exp`, optional-valid `nbf`, token purpose, `scope` and PKCE. No weakening JWT profile; do not reuse service-account laboratory token for end-user identity.
4. Define exact one-principal, one-workspace, one-Lead read-only canary; all other principals denied. Require explicit owner selection and grant authorization before writes.
5. Review ChatGPT connection registration contract (real callback URI and client authentication method, no invented values) and transport ingress separately. Current proxy is OFF. Never publish it without a distinct owner-approved release and fail-closed rollout/rollback.
6. Add isolated contract tests and CI in a *new narrow PR* against current main. Do not change `deploy/portainer-stack.yml`, restart the Web, or enable public MCP at this stage.

## GO / NO-GO

Current **GO**: source reconciliation, narrow tests and docs only.
Current **NO-GO**: public route/proxy, Keycloak client activation, production grants, ChatGPT real connection, unreviewed token/grant migration, PR #4 wholesale merge. Each requires verified contract, narrow reviewed change and separate operator authorization.
