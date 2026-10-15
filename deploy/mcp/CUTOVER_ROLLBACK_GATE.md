# DeepHarness MCP — pre-cutover and rollback gate (review only)

Checked: 2026-10-15. Scope: draft PR #4, 28server only. This is a **non-executable checkpoint**; it neither authorizes nor performs deployment.

## Verified checkpoint and sources
- PR #4 remains draft, head `202fe53d45154343f8e8708324e7ba27ffa7ebff` when checked. Base `test/chatgpt-bridge-alpha-compat`. Do not transfer historic CI green to subsequent commits.
- Live target identity readback: `medicspro-managed-admin` resolves to hostname `28server` (2026-10-15). The connected Portainer is **not** evidence about the DSH Portainer.
- Existing host/container/volumes inventory (2026-10-14): `deepharness-web-1`, `deepharness_dsh_data` mounted at `/data/dsh`, `deepharness_dsh_workspace` mounted at `/workspace`. Prior image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`; re-inspect before cutover.
- Existing profile disabled installer completed on owner terminal with `MCP_PREINSTALL_BACKUP_MATCH` and `MCP_EXISTING_WEB_PROFILE_DISABLED_INSTALL_MATCH`. Backup: `/opt/wandora/data/deepharness-mcp/backups/web-before-mcp`. Do not rerun installers or clear backups.
- Canonical evidence: `docs/CANONICAL_STATE.md`, `deploy/mcp/OPERATIONAL_INVENTORY.md`, `deploy/mcp/README.md`.

## Review-only candidate: concrete blockers
1. `deploy/mcp/portainer-stack.review.yml` puts **web, mcp-proxy, and mcp-grants-db** behind `mcp-review-only` profiles. The file is not an active replacement. Do not blindly remove profiles.
2. Candidate proxy has `traefik.enable: 'false'` and Envoy review configuration has disabled binding (`bind_to_port:false`). TCP HostSNI labels in a disabled service alone do not create a reachable route.
3. The current `deploy/portainer-stack.yml` has a single Web service using `DEEPHARNESS_IMAGE`, `DSH_BASIC_AUTH_USERS`, volumes `dsh_data` and `dsh_workspace`, and HTTPS router `deepharness`. Preserve exact router/middleware names and Web launch/authentication behavior. Before switch, prove compose project name and **actual Docker volume names** map to the existing volumes; matching YAML *keys* does not prove this.
4. Resolve and validate a single operational configuration, runtime policy, DB read-only role, grants DB persistent writable data directory and restart semantics, private backend, TLS listener, Envoy mTLS, SNI routing on the existing `websecure`, and reload timer. Do not alter shared Traefik global configuration or enable another DSH.
5. Verify host's effective Docker state, exact applied Portainer revision, image digests, existing Web authentication, TLS origins, profile mount and plugin state. Secrets and private user mappings remain off-repo and out of chat. A healthy CI fixture is not production evidence.
6. Exact ChatGPT callback is **unknown** until observed in its connection UI. Dedicated OAuth clients and explicit principal/workspace/Lead grant remain disabled/absent until reviewed provisioning; never synthesize a callback or grant.

## No-op preflight and cutover requirements (not executed)
- Snapshot **metadata** of running Web image, Compose project, volumes and mounts, labels, ingress, network, and health. Preserve `/data/dsh`, `/workspace` and original MCP-profile backup without copying secrets to Git/logs.
- Verify read-only backup restore drill in a safe isolated location, and a matched rollback image/configuration that keeps the prior DSH Web launch token/BasicAuth handling. Confirm Web health/login before action.
- Produce an explicit before/after Compose diff; prove one Web process, no second DSH, unchanged existing volume IDs, no public MCP route until all identity/database controls are ready. Require reviewed operational values and the deployment authorization gate.
- Bootstrap grants DB with an admin role isolated from the MCP runtime reader; deny read by default and test reader cannot grant/update/revoke. Only allow a specifically approved principal/workspace/Lead tuple.
- First enable private health tests and negative authorization checks, then controlled TCP/SNI + mTLS and OAuth; canary exactly one permitted read. Check absent bearer, wrong principal/tuple, revoked token/grant and database outage fail closed.

## Rollback order (operational plan, not a command sequence)
1. Stop MCP ingress / disable dedicated TCP router and proxy; confirm new MCP read fails.
2. Revoke exact grant and access token **authoritatively** at primary storage; disable dedicated OAuth clients. Disabling a client alone may not invalidate issued JWTs.
3. Restore original Web-only Compose/revision and immutable image after inspecting volume IDs/mounts; **never delete or recreate DSH volumes**. Do not repeat disabled installer or overwrite profile backup.
4. Verify Web route, BasicAuth, Agent Teams and old profile functionality; prove MCP remains inaccessible. Collect redacted evidence and record post-cutover/rollback state in canonical docs.

**Status:** preparation recorded in Git only. No production route, OAuth callback, grant, redeploy, renewal timer or ChatGPT canary verified by this document.
