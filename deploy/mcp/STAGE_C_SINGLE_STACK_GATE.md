# Stage C — single-stack operational transition gate (review only)

Date: 2026-10-15. **NOT DEPLOYABLE. No Portainer change authorized.**

## Verified baseline

- Correct Portainer is on 28server, stack ID 90, Git source `OARANHA/deepharness` at `deploy/portainer-stack.yml` using `refs/heads/main`.
- Owner-observed Portainer checkout Compose SHA-256 `e50ee3b6c394c04ad0fb3248b7550dac2b5b64fe7deea0d0c062c8c756f92758` exactly matches current GitHub main Compose. This does **not** identify full applied Git SHA or effective resolved environment.
- Owner-observed `deepharness-web-1` runs image ID `sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`, restart count 0, original `dsh web` command, `deepharness_dsh_data:/data/dsh`, `deepharness_dsh_workspace:/workspace`, network `traefik-public`.
- `portainer-stack.private-stage.review.yml` preserves the source Web service; owner observed `docker compose config --services` output exactly `web`, and `config --quiet` succeeded with placeholder values. This proves default selection and parse, **not runtime MCP capability**.
- Operational host source `run-operational.mjs` is explicitly opt-in, reads `/etc/wandora-mcp/runtime.json`, boots the official existing Web profile through `startOperationalReadHost`; `operational-host.mjs` requires `enabled:true`, distinct Web/MCP interfaces, validated read-only PostgreSQL role, pinned discovery and mTLS. Stage A original `dsh web` does NOT start this host.
- Exact commit `19d618ba0266fa97e743789f53b9b05ea8dd030a` passed six CI workflows; bootstrap run [38836869201](https://github.com/OARANHA/deepharness/actions/runs/38836869201) passed disposable official Web + restricted real PostgreSQL + mTLS. No production deployment evidence.

## Chosen transition design: one Web process, not two

The only currently tested operational host architecture **replaces** the original Web command/image with the single official-profile `run-operational.mjs` launcher. It is **not safe** to keep the original `dsh web` process and add a second operational host reading the same `/data/dsh` profile/workspace without a separate proven concurrent-safety contract. Likewise, do not activate the existing `portainer-stack.review.yml` wholesale: its `web` service is profile-disabled and its staged review runtime is `enabled:false`, which deliberately refuses launch.

For Stage C, build a distinct **private operational cutover candidate** based on the already reviewed replacement topology, subject to all gates below. It should contain exactly one Web service bound to the original volumes, two separate internal/edge network identities on the same Web container, a grants database with its own volume, and a profiled-off, ingress-disabled proxy. The operational runtime `enabled:true` is required for the single Web launcher but **must be provided only at a separately approved maintenance execution**, with no grants and no public MCP routing; generating it in review or turning on a live listener is not authorized here. Keep production's existing Web command untouched until cutover authorization.

## Hard preconditions and rejection rules

1. Confirm a pinned deployable host image digest and actual image entrypoint; preserve old immutable image **reference** as well as observed runtime image ID. Do not infer an image registry reference from the image ID.
2. Produce an exact replacement **single-stack** Compose file and validate *native* `docker compose config --services` / `--format json` using placeholder secrets. Assert exactly one Web service, unchanged Traefik Web labels and BasicAuth presence, original two external Docker volume names, no published host ports, separate internal network, persistent grants data, and proxy `traefik.enable=false`. Never publish redacted or real BasicAuth values.
3. In a fresh disposable CI environment, run the official Web profile + real restricted PostgreSQL grants primary + private mTLS and fail-closed denial/revocation, **including Web HTTP availability**. Repeat for the exact final candidate SHA; record run IDs.
4. Preflight on 28server must be read-only and redacted: `docker inspect` image/command/network/volume/restart; presence and permissions of dedicated TLS/password files (not contents); original Web response/Agent Teams baseline; Portainer environment key names only.
5. Require explicit **first owner approval** to update the *same* Portainer stack ID 90 during a maintenance window; record baseline health, the exact tested candidate SHA, resolved Compose and immutable old/new images. Do not auto-redeploy or modify Git reference silently.
6. After separately authorized private switch, verify Web login/session and Agent Teams, grants primary read-only role, no grants, proxy public route off and no MCP exposure. If any invariant fails, restore prior Git-backed Web-only Compose and image through an **explicitly authorized** rollback while preserving volumes.
7. Require separate **second owner approval** for OAuth clients, exact workspace/Lead grant, public Traefik TCP route/mTLS proxy and one real ChatGPT read canary; verify revocation. Private Stage C GREEN never grants ingress permission.

## Explicit blockers

- Full applied Portainer Git SHA remains unknown; saved Compose source identity is known.
- No validated **final transition Compose** with complete private operational Web launch and fallback; Stage A is Web-only, prior candidate is profile-disabled.
- No approved deployment window, no verified live end-to-end user session after a replacement, and no real ChatGPT canary.
- Existing CI covers disposable integration rather than Portainer change/rollback.

**Decision: NO-GO for production cutover; GO for implementing and testing a new review-only private operational single-stack artifact and disposable rollback test.**
