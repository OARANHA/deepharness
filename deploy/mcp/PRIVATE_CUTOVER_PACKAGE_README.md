## Independent branch gate — 2026-10-16

Compared against original `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`: exactly four added review files; **`deploy/portainer-stack.yml` remains identical**. Ran the copied `verify-effective-compose-safe.py` and candidate Compose in the independent isolated 28server ops workspace; exit 0 and markers `STAGE_C_EFFECTIVE_COMPOSE_DUMMY_ONLY_MATCH`, `STAGE_C_UID1000_PRIVATE_NO_PROXY_MATCH`, `STAGE_C_EXISTING_VOLUMES_BASICAUTH_MATCH`. No secrets or Portainer writes.

The GitHub workflow lookup for commit `7b152c488c606e8a3c94088b1c938ef277e5930e` returned **zero runs**, not an implicit GREEN. The branch is a **review-only package**, not yet a self-contained deployable artifact; operational implementation is in PR #4/pinned image and not in these four files. Further provenance checks, a dedicated branch CI gate and owner-approved runtime/deploy commit are mandatory. **NO-GO.**

# DeepHarness Stage C — private cutover review branch

**NOT DEPLOYABLE / NO-GO — review-only package, 2026-10-16.**

This branch was created from the original Web-only Git commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`. The operational Portainer file **`deploy/portainer-stack.yml` remains original and unchanged**. No changes to `main`, no PR merge, no Portainer update, no runtime activation.

## Exact reviewed artifacts

- `deploy/mcp/portainer-stack.stage-c.review.yml`: private Stage C candidate with single operational Web (UID 1000), read-only PostgreSQL primary (UID 999), preexisting DSH volumes and Traefik BasicAuth; proxy excluded by default via `mcp-review-only` profile and `traefik.enable:false`. **DO NOT apply to Portainer.**
- `deploy/mcp/runtime.review.json`: **`enabled:false`**. This file is intentionally rejected by operational startup. Do not set true in Git or substitute it as a production runtime.
- `deploy/mcp/verify-effective-compose-safe.py`: resolves and inspects candidate using dummy-only values, no credentials, no Docker container start or Portainer call.

## Exact candidate image identities

- Operational Web `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`
- Grants DB `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`
- Envoy (DISABLED) `ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877`

Rollback source is full Git commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4` or convenience branch `safety/deepharness-web-original-20261016`; original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`.

## Missing gates

1. This branch carries only review artifacts; the operational host implementation lives on **PR #4's separate branch** or in a previously published image. Independently verify that exact image's source provenance and features are consistent with this review package.
2. A real `runtime.json` with `enabled:true` **must not be created until first explicit maintenance/cutover approval**; `/opt/wandora/data/deepharness-mcp/review` was absent at last owner readback.
3. Frozen final deployment commit with exact effective Compose under the Portainer-configured path, owner-approved variable-name plan and verified all mounts; current Portainer Git source is `refs/heads/main`, file `deploy/portainer-stack.yml`. This branch is not used by Portainer and must NOT be repointed blindly.
4. Owner maintenance window, explicit first approval for existing stack 90, and live Web/Agent Teams rollback canary; public proxy/OAuth/grants require **second approval**.
5. All CI on **this branch** must be run/checked independently; the prior 10/10 GREEN pertains to PR #4 commit `f4e98315426dc7479db4044a85e295dcd494d739`, not this package.

Never paste DB credentials, BasicAuth hash, private keys or runtime secrets in Git, logs or chat.

**Action today: inspect/validate package only. NO-GO for private cutover.**
