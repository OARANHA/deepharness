## Owner live Docker image readback — 2026-10-16

Owner executed read-only `docker inspect deepharness-web-1 --format 'ImageRef={{.Config.Image}} ImageID={{.Image}}'` on **28server**:

- Original rollback image reference: `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`.
- Original observed image ID: `sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`. Both explicitly reported by Docker, not inferred from one another.

The owner also executed `docker image ls --digests --format '{{.Repository}}@{{.Digest}}' | grep -E 'deepharness-mcp|deepharness-grants|wandora-envoy'`. **Only** `ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877` appeared. The operational host/grants image references were **not confirmed** by this list. This does not prove either image is absent: digest listings may omit local images without matching repository digests. Require targeted `docker image inspect` on all three immutable references, printing only ID and repo digests, before deployment. Do not pull/rebuild/cleanup automatically.

**Status: rollback image reference CONFIRMED, Envoy digest LISTED, host/grants local presence UNKNOWN. Private cutover remains NO-GO.**

# MCP controlled cutover — immutable review manifest (NOT EXECUTABLE)

Date: 2026-10-16. Target: existing Portainer on 28server, stack **90**, repository `OARANHA/deepharness`, branch `refs/heads/main`, file `deploy/portainer-stack.yml`. This document **does not authorize** a Portainer update or change to the Git branch.

## Existing production baseline and rollback references

- Last owner-confirmed live container `deepharness-web-1`, status running, restarts 0, original Web command, only `traefik-public` network.
- Live Docker image ID **`sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`**. This is an observed Docker image identity; do **not** misrepresent it as a registry digest or the `Config.Image` registry reference.
- Original DSH volumes must remain **`deepharness_dsh_data:/data/dsh`** and **`deepharness_dsh_workspace:/workspace`**.
- Portainer saved original Compose `deploy/portainer-stack.yml` SHA-256 **`e50ee3b6c394c04ad0fb3248b7550dac2b5b64fe7deea0d0c062c8c756f92758`** (1,787 bytes), identical to GitHub `main` at owner readback. Last deployed full commit SHA is **unknown**. Capture correct rollback Git commit/reference and image reference **before** cutover.
- Existing `deep.wandora.com.br` Web Traefik labels, BasicAuth middleware, port 3080, JEV, Agent Teams profile and installed disabled MCP bundle must remain intact.

## Pinned candidate images (previously verified/pulled, reconfirm before approval)

- Operational Web: `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`
- Restricted PostgreSQL grants primary: `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`
- Envoy MCP proxy (MUST remain inactive during private cutover): `ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877`

These image references originate from earlier published-image provenance checks and owner Docker pull on 28server; they are not fresh readback of the current daemon and must be verified before execution. Do not rebuild images on the VPS.

## Operational runtime ownership

- Schema: `version:1`, `enabled:true`, issuer `https://id.wandora.com.br/realms/deepharness`, resource `https://dsh-mcp.wandora.com.br/mcp`, backend port 3443, allowed origins exactly `https://chatgpt.com` and `https://chatgpt-mtls-proxy.invalid`. The latter is an internal sentinel, **not** an authorized public Origin.
- `deploy/mcp/runtime.review.json` remains `enabled:false` and must not be substituted for the live startup file: the operational launcher rejects disabled configurations and the Web would not boot.
- Future `runtime.json` with `enabled:true` must be rendered **only on the owner's approved maintenance execution**, into a dedicated reviewed path with restrictive permissions. Approval to prepare a plan does **not** approve writing it, starting any MCP listener, or enabling OAuth/grants/public ingress.
- The private Web host requires a unique Web-facing and internal-only backend Docker network, a restricted PostgreSQL reader, configured internal TLS, pinned OIDC discovery and successful official DSH profile startup. Fail closed before cutover on missing files, role mismatch, absent bundles or ambiguous DNS.

## Required single-stack deployment posture

- The Stage C review YAML `deploy/mcp/portainer-stack.stage-c.review.yml` has default active `web` and `mcp-grants-db`; `mcp-proxy` is `mcp-review-only`, with `traefik.enable: 'false'`. All services have zero host ports. Existing DSH volumes external by exact Docker name; the grants DB has its own independent persistent volume.
- Stage C source checks, native Compose rendering with placeholders, disposable official Web rollback, and operational PostgreSQL + mTLS CI passed on their evidenced SHAs. None verifies a real deployed stack 90 cutover. Never deploy the review YAML as-is, since its runtime input is disabled and effective Portainer environment remains unverified.
- Production Web would be **replaced within the same Compose service** by the single official-profile operational launcher, not run concurrently as a second DSH process sharing data.
- Before seeking first approval, produce a **deploy-ready frozen commit and redacted effective Compose**, verify `Config.Image` and environment key presence, file paths/modes, source SHA, exact volume identity, Traefik labels and current Web response. Avoid exposing BasicAuth hashes or actual env values.

## First approval boundary: private cutover only

Explicit owner approval must name the exact candidate Git SHA, stack ID 90, image digests, reviewed environment keys, acceptable maintenance window, and rollback reference. On authorized execution only: preserve baseline, apply one Git-backed Portainer update, verify existing Web and Agent Teams, private DB role, internal mTLS, zero grants, and **no externally routed MCP**. Any failure triggers the reviewed rollback. Do not modify unrelated Portainer stacks.

## Second separate approval boundary: ChatGPT connection

Only with a healthy private Stage C deployment: explicitly authorize MCP TCP/SNI public proxy ingress, actual mTLS trust/renewal, dedicated Keycloak OAuth clients and login, exact authenticated principal/workspace/Lead grant and **one** real ChatGPT read canary. Denial and revocation tests must precede broader use.

## Rollback: precise future authorized order

1. Shut off MCP public ingress; revoke any active grants/tokens at authoritative PostgreSQL and disable dedicated OAuth clients. Do not assume OAuth client disable alone revokes already-issued JWTs.
2. Restore the previously pinned **original Git-backed Web-only Compose and image reference** through the **same Portainer stack 90**, retaining both original DSH volumes and original BasicAuth/Traefik Web labels. Require explicit owner authorization for this write.
3. Confirm original Web BasicAuth and HTTP, sessions/Agent Teams, JEV, original mounts/image, and denial of all MCP reads. Never prune original volumes, reinstall profile or touch unrelated stacks.

**Decision: NO-GO for production until the remaining readbacks and a deploy-ready runtime+Compose package are independently verified.**
