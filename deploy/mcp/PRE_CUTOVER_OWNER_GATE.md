# DeepHarness MCP — final pre-cutover decision sheet

Date: 2026-10-16. **Decision: NO-GO for Portainer deployment until every blocking precondition is proven and owner explicitly approves.**

## Proven, by evidence

- Production: Portainer **28server**, stack **90**, repo `OARANHA/deepharness`, ref `refs/heads/main`, Compose `deploy/portainer-stack.yml`. Saved Compose SHA-256 `e50ee3b6c394c04ad0fb3248b7550dac2b5b64fe7deea0d0c062c8c756f92758` is byte-identical to observed GitHub main Compose; **the exact deployed Git SHA remains unknown**.
- Existing Web container `deepharness-web-1`: image ID `sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`, running, zero restarts, `dsh web --no-open --port 3080`, `traefik-public`, existing volumes `deepharness_dsh_data` and `deepharness_dsh_workspace`. Preserve BasicAuth/Traefik route, existing Agent Teams/JE​V and installed disabled MCP bundle.
- Stage A: original Web unchanged, optional proxy/DB profile-disabled, native `config --services` exactly `web` and `config --quiet` passed with dummy values.
- Stage B: real official Web + disposable PostgreSQL restricted role + private mTLS and revocation checks passed in CI (run 38836869201) for its named commit; no real owner ChatGPT OAuth.
- Stage C: native Compose with dummy values selects `web` + `mcp-grants-db`, no proxy, `config --quiet` passed; synthetic infrastructure rollback and official Web disposable restore workflow green in run 38844271194 (commit `2ea0282fc48263ce29ffcaf3b329c1a5eabcbef6`). These are isolated tests, **not an actual Stage C Portainer deploy / rollback**.
- Confirmed on commit `8eb1168327d516e7cdfaf2571c59d8466b400c56`: seven workflows success; bootstrap workflow was **still in progress** at the single readback. Do not claim all eight green or extrapolate checks to a new SHA.

## Blocking checklist before requesting first authorization

- [ ] Freeze and verify **one exact final candidate commit SHA**; all applicable required workflows green at that exact SHA.
- [ ] Resolve Stage C Web bootstrap: the operational launcher requires `/etc/wandora-mcp/runtime.json` **enabled:true** and runtime secrets, a valid read-only DB primary, pinned OIDC discovery, and two distinct network identities. `runtime.review.json` is **enabled:false**, deliberately fail-closed; never deploy it as the real startup file. No real runtime enabled from this document.
- [ ] Confirm actual host/DB/proxy immutable image digest references, validate their config and entrypoints, and verify real file mounts/UID/perms *without reading secrets*. Record the original registry image digest and the known runtime image ID for restoration.
- [ ] Confirm native **effective redacted** Compose with the final Portainer environment variable **names**; preserve original Web labels including BasicAuth middleware, data/workspace volumes, exposed HTTP route, JEV/Agent Teams profile and zero published host ports; inspect Docker network alias routing and internal-only MCP listener.
- [ ] Verify Web HTTP/login and Agent Teams baseline, and prepare timeboxed health/readiness and immediate fail-closed rollback steps. A CI fixture that restores official Web HTTP does not guarantee live sessions survive.
- [ ] Audit exact Portainer stack 90 transition method: single existing Git-backed stack; avoid accidentally applying to connected `portainer.wandora.com.br` (other Portainer). No second DSH stack; no automatic GitOps, no blind `Pull and redeploy`.
- [ ] Rehearse the **actual candidate** to original-image fallback in disposable CI, including authoritatively disabled ingress and no grants. Existing synthetic and Web restoration tests are useful but not equivalent.
- [ ] Confirm the correct **rollback Git reference/commit**, original image, and retained exact volumes; plan operator-owned restoration in stack 90 and post-restoration Web/Agent Teams and MCP-denied readbacks.
- [ ] Owner approves explicit maintenance window and **first authorization** for the precise stack/digest/commit change. Until then **NO DEPLOY**.

## Explicit second authorization — not implied by first

Only after the private stack passes production Web continuity checks: separately approve dedicated TCP/SNI public ingress, Envoy mTLS with the correct CA and certificate renewal, exact Keycloak human OAuth client activation and callback, named authenticated principal/workspace/Lead read grant, and **one** real ChatGPT tool canary. Validate grant and token revocation in PostgreSQL primary; keep all other reads fail-closed.

## Operational rollback order (future approved maintenance window)

1. Disable MCP external ingress first and verify no public read; revoke approved token/grant at authoritative PostgreSQL and disable OAuth clients as appropriate.
2. Restore pinned **original Web-only Compose Git reference and image**, preserving `deepharness_dsh_data` and `deepharness_dsh_workspace`; never run installer or prune either volume.
3. Verify original `deep.wandora.com.br` login/BasicAuth, session and Agent Teams continuity, Web health and MCP denial. Escalate any mismatch; no repeated blind redeploys.

**Current permitted operation:** code/CI/source review only. **No Portainer write, merge, restart, profile mutation, OAuth enablement, grant, public listener or production secrets access.**
