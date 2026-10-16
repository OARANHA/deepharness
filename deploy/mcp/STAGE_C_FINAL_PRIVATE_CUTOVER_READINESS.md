# Stage C — final private cutover readiness review (not an authorization)

Reviewed 2026-10-16. **Decision: NO-GO until the remaining blocking evidence is complete and the owner explicitly approves the exact production operation.**

## Verified evidence

| Gate | Evidence | State |
| --- | --- | --- |
| Current Web source rollback | `safety/deepharness-web-original-20261016`, commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`, original Compose blob `cd72a46a2e458fcc6902d3ca243ac31c2979d346`; original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075` | SOURCE FROZEN; actual deployed Git SHA unknown |
| Four images | Original, MCP Web `2483c85c…`, grants `6279a36d…`, Envoy `9a24a2c5…` inspected by owner on 28server | PRESENT |
| Credentials/certificates host metadata | Five protected files regular, expected UID/GID and restrictive modes; no values read | PASS |
| Actual file binds | Owner authorized and executed 5/5 ephemeral rootless-user, no-network, readonly-mount open+fstat probes | PASS |
| Private isolated integration | Web UID 1000, restricted PostgreSQL + mTLS, revocation, private-only network, rollback | PASS in CI |
| Safe resolved Compose | `verify-effective-compose-safe.py` with **dummy-only** variables, Web and DB UIDs, no proxy, data/workspace volumes, BasicAuth | PASS in CI |
| CI | Ten workflows GREEN at `e53a4b741f298fdaef44553ec21017502aad2b4a` | PASS at that SHA ONLY |
| Original Portainer variables | Owner manually confirmed `DEEPHARNESS_IMAGE` and `DSH_BASIC_AUTH_USERS` present in stack 90; values not read | PRESENCE ONLY |

## Blocking open items — do not conflate source and deployment

1. **Active runtime missing by design**: `/opt/wandora/data/deepharness-mcp/review` absent at last root `namei` readback. `runtime.review.json` remains `enabled:false`. No approved `enabled:true` runtime or user/mode verified. Do not create it before specific owner approval.
2. **Final runtime credentials and readiness**: confirm non-secret OIDC discovery, DB reader role, TLS validity and Web/Agent Teams baseline at time of maintenance. Isolated CI does not establish live continuity.
3. **Portainer exact effective configuration**: Stage C requires new variable names `DSH_MCP_HOST_IMAGE`, `DSH_MCP_GRANTS_IMAGE`, `DSH_MCP_PROXY_IMAGE`, `DSH_MCP_REVIEW_ROOT`, `DSH_MCP_SECRET_ROOT`; not yet installed in stack 90 and not expected today. Current Portainer env variable **presence** is known, but effective production interpolation is not. No secrets should be pasted.
4. **Git deployment route**: Portainer 28server stack 90 is Git-backed on `refs/heads/main`, `deploy/portainer-stack.yml`; PR #4 review branch has diverged from main. There is no authorized/pinned deployment commit for stack 90. **Do not merge PR #4 blindly, point Portainer at the review branch, or create another DSH stack.**
5. **Recovery assurance**: source rollback branch and official disposable Web restoration are established, but a complete production Portainer rollback rehearsal is not. Exact stack update procedure and owner-maintained env/volumes must be verified at change window.
6. **Separate owner approvals**: first for one private-stack update with exact commit, maintenance window, verified rollback, and abort criteria; later, separately, for public proxy/OAuth/real read grants/ChatGPT canary. No implied authorization.

## What would be changed after explicit first approval only

Use the **existing** Portainer 28server stack ID 90, not an additional stack. Replace the single Web service with the pretested official-profile operational host pinned at `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`; start one isolated restricted grants PostgreSQL image pinned at `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`; preserve exact `deepharness_dsh_data` and `deepharness_dsh_workspace`, BasicAuth/Traefik Web route, and private backend network. `mcp-proxy` stays disabled and no public MCP listener is exposed. The owner-only `runtime.json` would be created/validated in the approved window. Any mismatch must fail closed and invoke approved recovery.

## Verification/abort sequence for future authorized change

- **Before**: freeze rollback commit `b5e6374…` and original image, inspect stack ID/name/Git ref and actual production Web, confirm Web login/Agent Teams and env keys, capture mount/network metadata without secrets.
- **Apply only on authorization**: one pre-reviewed Git-backed stack 90 private cutover; do not enable Keycloak clients, public proxy, or real grants.
- **After**: check the same Web URL with BasicAuth, preserve existing Agent Teams, ensure exactly one Web container, DB restricted reader and private mTLS, deny public MCP requests, verify unchanged DSH volumes and safety bounds.
- **Abort**: failed Web startup, degraded original sessions/Agent Teams, unexpected MCP exposure, network/volume mismatch, permissions/auth mismatch, or elapsed approved window. Stop/deny MCP, restore original Compose and image to same stack ID 90 preserving both named volumes and original BasicAuth/Traefik; verify Web/Agent Teams and public MCP denial. No blind retries.

This document is an audit artifact, not a production runtime specification ready to apply. **NO-GO remains until the owner-approved maintenance decision.**
