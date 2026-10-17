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

## Remote Docker read gate — verified 2026-10-17

This is an independent read-only MCP Wandora runtime check, **not** proof of OAuth authentication from ChatGPT to DeepHarness:

- Central `remote-ops-mcp` replied `status=ok`, `authMode=oauth`, `mockMode=false`. That OAuth setting authenticates the Wandora control-plane session, not a real DeepHarness OAuth user.
- `target_status(detail=full)` confirmed enabled `deepharness-read` with `read-only` capability and exactly `deepharness-web-1`, `deepharness-mcp-grants-db-1` in `allowedDockerContainers`. Docker exec, Docker actions, writes and administrative programs remain disallowed.
- Actual `docker_health` through that target returned Web `running` and grants PostgreSQL `running, healthy`. Thus the earlier host Docker proxy HTTP 403 read block is no longer present for these two containers.
- A query for `supabase-db` using `deepharness-read` was correctly denied with `CONTAINER_NOT_ALLOWED` at the target policy. This is not evidence of an outage of the MedicsPro service or other independently governed targets.
- Source reconciliation confirmed `main` at `c71c791d7e33084c67198643200764069c1c2668`; PR #4 remains Draft, contains a broad integration surface, and must not be merged wholesale. PR #7 remains review-only.
- Neither container health nor the private mTLS tests establish deployed OAuth adapter compatibility, a real `issuer#sub` principal, persistent read grants, or an authorized `dsh_read_agent_team` call. No additional restart, deployment, new grants, runtime exposure or Keycloak change was performed in this check.

**Next gate:** reconcile the actually deployed pinned image and host wiring with the narrowly reusable PR #4 adapters; prepare isolated strict OAuth/authorization tests against the current `main`. Release, public transport activation and production principal/grant setup remain NO-GO pending separate operator approval.

JEV consulted as advisory for the next bounded task; it favored `deep_review`. This does not override the policy, operator approval, or runtime evidence.

## PostgreSQL query cancellation source-audit gate (review-only, 2026-10-16)

**Code-level finding, NOT a production incident claim.** In Draft PR #4 `deploy/mcp/operational-host.mjs`, the adapter is built as `const query=(sql,params)=>pool.query(sql,params)` and passed to the persistent policy. This intentionally or inadvertently drops the `opts` third argument supplied by both `adapters/postgres-read-grants.mjs` and `adapters/postgres-token-revocation.mjs`: `{signal:AbortSignal, readFromPrimary:true}`. The unit test for `postgres-read-grants.mjs` asserts those options on a mock `query`, while `operational-host.test.mjs` records SQL only. Neither test verifies this real composition.

**Risk and existing mitigations.** The adapter's `Promise.race` times out and denies the caller, but an aborted JS `AbortController` is not thereby proven to cancel an active PostgreSQL server query. `readFromPrimary` is a custom intent, not a documented `pg` QueryConfig option; current operational host pins its pool to `mcp-grants-db` and validates `pg_is_in_recovery()=false` at startup, partially mitigating replica uncertainty. `init-read-role.sh` configures `dsh_mcp_reader` with `statement_timeout='1500ms'`, but the effective GUC has not been verified on live database sessions; role settings apply to newly established sessions. A real `statement_timeout` aborts the statement on the PostgreSQL server, whereas a client `query_timeout` alone is not proof of server cancellation.

**Pinned dependency source.** The candidate Dockerfile installs `pg@8.16.3`. The node-postgres changelog says `pg@8.13.0` added per-query `query_timeout`; the official client documentation lists `query_timeout` and `statement_timeout` in connection config, but **does not specify `AbortSignal` or `readFromPrimary` as supported per-query `QueryConfig` fields**. Do not replace the wrapper with blind `pool.query(sql,params,opts)` or assume `signal` cancels server execution.

**Required isolated regression gate before production OAuth/grants:**

1. Add an operator-reviewed query bridge in a **separate authorized code change**, mapping the internal read-only query contract to documented, pinned `pg` behavior. Validate fixed SQL/parameter binding, primary-only connection, read-only role, and effective `SHOW statement_timeout` on each new connection or equivalent guaranteed pool invariant.
2. Exercise `startOperationalReadHost` with the real `createPostgresReadGrantStore` and `createPostgresRevocationBackend` (or a structurally equivalent full-composition fixture), not only separately mocked query adapters. Assert that grants and revocation queries preserve their immutable hashed key, primary intent and deadline semantics across the boundary.
3. On a disposable PostgreSQL primary under the actual pinned `pg@8.16.3`, verify a deliberately slow query is terminated by server-side `statement_timeout`; separately verify client-side timeout denial, pool connection reuse and no late authorized MCP response. Assert `pg_is_in_recovery()=false`, `current_user=dsh_mcp_reader`, `default_transaction_read_only=on` and the effective `statement_timeout`. Avoid a production DB and never print credentials.
4. Recheck exact grant after await/resolution and after projection; verify revocation during an in-flight read denies output. Prove missing/ambiguous rows, network loss, stopped primary or malformed identity do not authorize.
5. Tie the deployed immutable `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f` to a build source SHA / tested image artifact independently before assuming PR #4's implementation matches runtime.

**Boundary:** Source-only audit. PR #8/#9 isolated tests were GREEN at their recorded commits and remain Draft. The subsequent identity-adapter code write was blocked by tool security settings; do not work around that policy through another tool, branch or encoding. No code merge, grant, Keycloak action, Portainer redeploy, listener activation, Docker exec or production data read is authorized. An attempted fresh read-only remote Docker inspection returned `SSH_UNAVAILABLE agent_request_timeout`; previous Stage C GREEN is historical, not current health proof.

References:
- https://github.com/brianc/node-postgres/blob/master/docs/pages/apis/client.mdx
- https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md
- https://github.com/brianc/node-postgres/issues/2774
- https://www.postgresql.org/docs/16/runtime-config-client.html
- https://www.postgresql.org/docs/16/sql-alterrole.html
