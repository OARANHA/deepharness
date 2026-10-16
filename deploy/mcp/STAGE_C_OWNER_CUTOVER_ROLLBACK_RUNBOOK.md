# Stage C — owner approval and rollback runbook (review-only)

**State: NO-GO. This document is NOT an authorization to change production.**
Target: existing 28server Portainer **stack ID 90**, Git-backed `OARANHA/deepharness` / `refs/heads/main` / `deploy/portainer-stack.yml`. Current Web endpoint `https://deep.wandora.com.br` retains Traefik BasicAuth. Do not use a second stack, change the Vigia/other Portainer, publish MCP, or enable OAuth as part of the first gate.

## Immutable known recovery anchors

- Original Web Compose: `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`, Git blob `cd72a46a2e458fcc6902d3ca243ac31c2979d346`, 1787 bytes, backup reference `safety/deepharness-web-original-20261016`.
- Original Web image: `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`.
- Keep the existing named Docker volumes `deepharness_dsh_data` and `deepharness_dsh_workspace`, existing Traefik `traefik-public` network and the original BasicAuth variable. Never delete/recreate volumes.
- Private MCP operational Web `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`, grants DB `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`. Disabled proxy `ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877`.

## Evidence already captured (not evidence of live readiness)

- PR #4: isolated tests for the official Web, identity/policy, mTLS, PostgreSQL and disposable rollback. Separate owner-approved 5/5 bind-open canaries confirmed file access only, not TLS expiry or DB availability.
- Dedicated review-branch Stage C CI `23e90b0c9225b2de2c920bf4b5ce9beb961ae7ae`, Actions run `38861219952` GREEN. Checks original Compose blob, dummy-only resolved private Compose, disabled runtime review file, tested and published artifact/digest identity, launcher existence and offline configuration fail-closed.
- On 28server the owner previously confirmed two original **variable names** `DEEPHARNESS_IMAGE` and `DSH_BASIC_AUTH_USERS`. Values were never collected.
- Operator runtime directory `/opt/wandora/data/deepharness-mcp/review` absent at the latest recorded root check. Review JSON is deliberately `enabled:false` and will not boot an operational host.

## First approval gate — checklist (do not execute yet)

1. Owner designates maintenance window, acceptable interruption and rollback decision-maker. Capture baseline Web and Agent Teams functionality, container count, Docker network/volume attachment identities, and Portainer stack 90 Git source and env variable **names only**.
2. Independently pin and inspect the exact **proposed** Git commit plus `deploy/portainer-stack.yml` diff and resolved Compose. A review-only candidate path is NOT the Portainer deployment path; do not repoint stack 90 to this branch and do not merge PR #4 wholesale. Pre-cutover submit complete source diff to owner.
3. Confirm all runtime dependencies without disclosing secret values: host directory/mount existence and UID/mode, valid mTLS key/cert chain, restricted DB reader, OIDC issuer/discovery reachability, exact existing DSH profile and Agent Teams. Never start second Web against production volumes.
4. Agree and stage the approved variables **without exposing their values**: `DSH_MCP_HOST_IMAGE`, `DSH_MCP_GRANTS_IMAGE`, `DSH_MCP_PROXY_IMAGE`, `DSH_MCP_REVIEW_ROOT`, `DSH_MCP_SECRET_ROOT`; preserve the two existing variables and auth labels. No runtime `enabled:true` before explicit approval.
5. Confirm recovery: exact original Compose and immutable image are available, original secrets stay in Portainer, original Web/data and workspace volumes remain attached. Plan update and rollback within **same** Portainer stack 90. A source backup is not a backup of live stack configuration or data.
6. Ask the owner for specific authorization **only after** these checks: exact commit, single-stack change, time window, expected interruption, rollback command/path and abort criteria. Silence or CI GREEN is not approval.

## Authorized change procedure — only with new explicit approval

- Operator takes timestamped, non-secret pre-change evidence and an approved backup of the current stack configuration and relevant data under existing backup policy. No unapproved access to credentials or secret material.
- Prepare operator-controlled `runtime.json` for the exact validated schema; enable only in approved private change window. Validate Web startup, PostgreSQL reader restrictions and internal mTLS.
- Apply exact owner-approved deployment artifact through established Git-backed stack 90 process **once**. Keep `mcp-proxy` Compose profile off, `traefik.enable:false`, no new published ports, no Keycloak client enablement, no user grants.
- Check single operational Web, preserved original DSH volumes, Web URL behind BasicAuth, existing Agent Teams/session reads, no public `dsh-mcp.wandora.com.br/mcp` ingress, internal grants DB and MCP listener health. Collect non-secret status only.
- Fail fast if original Web, Agent Teams, BasicAuth, data mounts, private network or absence of public MCP exposure differ from baseline. Do not retry destructive operations automatically.

## Rollback (only by authorized owner/operator)

If any abort condition occurs, stop the attempted private cutover and restore the **same** stack ID 90 to frozen original Web Compose and original immutable image, retaining original Portainer credential variables, Traefik labels, network and named volumes; disable private MCP services, verify exactly one official Web and the same Agent Teams/session baseline, and verify external MCP denial. Escalate to manual incident response if original Web does not recover. Do not delete grants DB or any DSH volume as an automatic recovery action.

## Independent second approval

Public proxy, public MCP ingress, Keycloak OAuth clients and binding real `sub` identity to Agent Teams grants are **out of scope** for private cutover; require a new explicit approval and separate tests.

**Remaining NO-GO blockers:** full proposed deployable commit not frozen; Portainer effective configuration and operator runtime not approved/readied; live readiness and recovery metadata not yet verified; maintenance window and first approval absent.
