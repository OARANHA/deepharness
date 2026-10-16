# Stage C — frozen original Web Compose fallback and operator runtime gate

Verified 2026-10-16, source-control preparation only. **Production cutover NO-GO.**

## Fallback reference

- Immutable Git commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4` (observed `main` during this review).
- Safety branch `safety/deepharness-web-original-20261016` created from exactly that commit; the branch is an operator-friendly pointer, not immutable protection against a later force-push. **Prefer the full commit SHA** when preparing an approved rollback.
- `deploy/portainer-stack.yml` from the safety branch was fetched and compared byte-for-byte to `main`; both are 1787 bytes and have Git blob SHA `cd72a46a2e458fcc6902d3ca243ac31c2979d346`.
- Previous 28server Portainer saved Compose checksum SHA-256 `e50ee3b6c394c04ad0fb3248b7550dac2b5b64fe7deea0d0c062c8c756f92758`; previously checked against `main`. This review did **not** re-open the production stack file, so exact currently deployed Git SHA remains unknown.
- Original production Web image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`. Restore exact existing Docker named volumes `deepharness_dsh_data` and `deepharness_dsh_workspace` through the same Portainer **28server**, stack **90**. Preserve BasicAuth, labels and original environment values; never dump credentials.
- Current `main` and MCP review branch diverged at review: 501 commits ahead and 3 behind relative to main (comparison with base commit `b5e6374`). Do not merge the review branch blindly or repoint Portainer to it.

## Runtime input gate

- `deploy/mcp/runtime.review.json` has `enabled:false` and **must remain disabled in source control**.
- Real operational Web launcher expects `/etc/wandora-mcp/runtime.json`, `enabled:true`, pinned issuer/resource, port 3443, and allowlisted origins; do not start this launcher with disabled review JSON.
- Operator-controlled enabled runtime file must be rendered and reviewed **only under explicit approved private cutover**, never committed with secrets. Confirm file existence, effective UID/GID/mode, mount and non-secret configuration before applying the approved stack.
- The reviewed Web Compose now explicitly runs `user: 1000:1000`; disposable CI showed real official Web + PostgreSQL + mTLS and synthetic owner-only key canary GREEN on prior commit `4e754b8daf9631083b387a000e2b9f476f8aa8b8`.
- The original Keycloak clients remain disabled; `mcp-proxy` remains profile-disabled and `traefik.enable:false`. No public MCP connection is authorized.

## Outstanding pre-deployment checks

1. Validate the **redacted effective Compose** against the real Portainer env **variable names** without exposing any values; verify actual mount paths, UID, DSH volume continuity, edge labels and no MCP public ingress.
2. Confirm host readability of runtime/TLS/DB file mounts under intended container users without printing file bytes.
3. Establish owner-approved first-stage maintenance window, a deploy-ready frozen candidate **commit** and actual Portainer stack 90 revert procedure. A Git safety branch alone does not snapshot Portainer configuration, env values or data.
4. After a separate, explicit authorization, stage the operator-owned enabled runtime and apply one controlled update to the **existing** stack 90; private Web/Agent Teams and MCP denial canary precede any second public/OAuth/grant authorization.

**No production changes, no merge, no OAuth activation, no real grants, no new listener.**
