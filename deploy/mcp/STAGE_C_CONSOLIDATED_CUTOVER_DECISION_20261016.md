# Stage C — consolidated private cutover decision package (2026-10-16)

**State: REVIEW PACKAGE COMPLETE; PRODUCTION CUTOVER NO-GO pending explicit approval and operator-owned runtime configuration. This document is not deployment authorization.**

## Goal and owner decision
Deploy MCP read-only operational host in the **existing** 28server Portainer stack **90**, preserve original DSH Web access, sessions and Agent Teams, keep public MCP proxy OFF. The owner chose preservation option A with **no mandatory full conversation/volume-history backup**. Never interpret waiver as permission to erase/recreate volumes.

## Exact deployment change (not applied)
- Current production Git source is `OARANHA/deepharness`, `refs/heads/main`, `deploy/portainer-stack.yml`; existing Compose blob `cd72a46a2e458fcc6902d3ca243ac31c2979d346`, safe original source commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`.
- Review candidate: `deploy/mcp/portainer-stack.stage-c.proposed.yml`. The complete target-path patch is `deploy/mcp/STAGE_C_PORTAINER_DEPLOYMENT_PATH_REVIEW.diff` (targets `deploy/portainer-stack.yml`). This file must be reviewed and separately applied to a **fresh, exact commit for approval**; the review file is NOT used by Portainer.
- Review candidate replaces the original Web command/image with the operational image; adds read-only runtime/certificate mounts, internal `mcp-private` network and grants DB. This is a real Web replacement and therefore may cause interruption. Does **not** add a second Web and keeps the same two external named data/workspace volumes.
- Web image candidate `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`; grants `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`; proxy image pinned but proxy disabled.
- `mcp-proxy` has disabled Compose profile and `traefik.enable:false`, and the candidate has no published host ports. BasicAuth route and `traefik-public` network are preserved.

## Verified evidence (do not rerun without new discrepancy)
- Owner authenticated to existing DSH Web through Traefik BasicAuth and DSH-owned launch URL, then observed readable history and Agent Team `lead`, `arquiteto`, `revisor`.
- Owner verified `deepharness-web-1` writable mounts on `deepharness_dsh_data:/data/dsh` and `deepharness_dsh_workspace:/workspace`, and stack 90 Git/ref/Compose path plus existing Portainer variable **names**.
- Owner verified backend server cert and CA X.509 first cert expiry >24h, OpenSSL verify under backend CA, matching backend certificate/private public keys, CA Basic Constraints `CA:TRUE`, and backend DNS SAN.
- Isolated Stage C Compose tests previously green; a freshly changed branch commit's CI must be checked before release. The latest isolated PR #4 Envoy test amendment has no green attested in this document.

## Remaining true cutover blockers (single approval review)
1. **Operator-controlled runtime:** `/opt/wandora/data/deepharness-mcp/review/runtime.json` was absent at root preflight. A validated, restricted production runtime configured for private activation does not yet exist; `enabled:false` review fixture must NEVER be deployed as operational host. Owner must approve creation/contents in a private maintenance step without sharing secrets.
2. **Minimal recovery of Portainer state:** current **values** of existing environment variables must be recoverable privately by the owner, not merely their names. Owner waived full DSH history backups but accepts potential irrecoverability of historical data. Existing original image and source must remain available; no live rollback drill required before authorization.
3. **Exact change and review:** produce a specific commit that updates `deploy/portainer-stack.yml` *only following owner approval to prepare deploy-path changes*; evaluate effective Compose using dummy secrets/approved values, preserve original BasicAuth, exact network and external volumes. Review only until authorized to apply.
4. **First production authorization:** owner approves exact commit/SHA, Portainer stack 90, maintenance window/downtime, operator-controlled runtime, safe abort and same-stack rollback. A generic `siga` or CI GREEN does not authorize production changes.

## What is deliberately deferred, NOT a blocker for private isolated deployment
- Full real proxy-to-backend mTLS **handshake** cannot occur before listener exists; prove in the first privately authorized deployment smoke test, abort/rollback on failure. Local cert/CA/SAN preflights completed. Client cert paths are source-pinned in Envoy generator as `proxy-backend-client-chain.pem`, `proxy-backend-client-key.pem`, `backend-ca.pem`, but proxy is OFF for first stage.
- **Public** proxy/ChatGPT connection, OAuth client activation, human `sub` grants and first real Agent Teams MCP read all require a **second independent approval**.

## Operator's one-window private cutover (NOT NOW)
1. Confirm approved exact commit matches reviewed target-path diff; check original Web, volume names, basic auth, secure Portainer variable recovery; collect only non-secret markers.
2. In authorized window prepare validated owner-only runtime, ensure expected mounts and no secret leakage, then update **the same** stack 90 once via approved Git-backed Portainer workflow. Do not edit another Portainer installation.
3. Require one operational Web, same DSH UI/Agent Teams/session readability, same writable volumes, unchanged BasicAuth, correct grants DB permissions and internal listener, and **no public MCP route**.
4. Failure of any condition: return same stack 90 to original Compose, immutable original Web digest `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`, prior Portainer credential values and existing volumes; do not delete DSH or DB volumes. Escalate if UI fails to recover.

**GO/NO-GO today: NO-GO for production, but review package consolidated. No deployment, merge, key/token export or host modification performed.**