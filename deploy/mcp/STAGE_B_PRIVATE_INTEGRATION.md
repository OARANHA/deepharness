# Stage B — Private operational MCP integration gate (2026-10-15)

**Status: isolated local tests GREEN; disposable end-to-end integration GREEN at commit `19d618ba0266fa97e743789f53b9b05ea8dd030a`. Not authorized for production.**

## Goal and architecture

Validate the existing official DeepHarness Web profile with the MCP read-only host, a separate authoritative PostgreSQL grants primary and certificate-authenticated private transport. Preserve **the sole existing** production DSH Web and its original Portainer stack 90. No separate public MCP ingress, OAuth user activation, grant or production database is created by this stage.

- Stage A file `deploy/mcp/portainer-stack.private-stage.review.yml` keeps the **original** production Web command and image; sidecars are profile-disabled and proxy Traefik-disabled. It is **not** a functioning Stage B MCP host: the ordinary `dsh web` command does not start the private MCP operational host.
- Stage B integration harness: `deploy/mcp/run-operational-ci.mjs`, invoked **only** in `GITHUB_ACTIONS=true`, builds disposable Docker networks, a disposable grants database and volume, and starts the **actual official Web profile** via `deploy/mcp/verify-operational-host.mjs`. It asserts **zero host port bindings** and deletes only CI-scoped resources. A test-only signing identity is used; no owner Keycloak login or real ChatGPT connection is proven.
- Runtime launcher `deploy/mcp/run-operational.mjs` / `operational-host.mjs` requires `enabled:true` under a pinned schema, two distinct Docker interfaces, a read-only PostgreSQL primary role, pinned OIDC discovery, configured private mTLS certificates, and fails closed if these are absent. The staged `runtime.review.json` has `enabled:false` and **must not** be used to replace production Web because the operational launcher rejects it before booting.
- Source-only `deploy/mcp/portainer-stack.review.yml` replaces the Web command and image but all services are disabled via `mcp-review-only`; it **cannot** serve as the approved deploy artifact without a separate Web continuity design and complete redacted native Compose validation.

## Executed read-only proof

On the 28server isolated ops workspace `/opt/wandora/ops-workspace/dsh-mcp-render-20261015`, ran:

```text
node --test deploy/mcp/operational-host.test.mjs deploy/mcp/private-read-listener.test.mjs integrations/chatgpt-mcp/test/postgres-read-grants.test.mjs
```

Observed **15 tests / 15 pass / 0 fail / exit 0**: disabled and malformed config fail-closed; single official Web boot dependency; primary grants read-only role; replica and write privileges rejected; ambiguous Docker interface rejected; disposal on listener failures; wildcard listener rejected; actual ephemeral mTLS listener rejects missing client certificate and admits valid certificate; exact hashed principal grant, revocation and deadline checks fail closed. These are **isolated unit and fixture tests** for DB behavior, not a new real production PostgreSQL verification.

The earlier PR parent SHA `9085faddee1c4f847710cd2519b0b2b36bae4a3e` passed full disposable CI run [38805937413](https://github.com/OARANHA/deepharness/actions/runs/38805937413), including official Web host, real disposable PostgreSQL, private TLS, grant and token revocation. **Do not carry its GREEN result forward to the current branch HEAD without new CI evidence.**

## CI confirmation for Stage B commit 19d618b (2026-10-15)

At exact branch commit `19d618ba0266fa97e743789f53b9b05ea8dd030a`, six pull-request-triggered workflows completed with **conclusion=success**, independently read from the GitHub Actions run API. In [bootstrap run 38836869201](https://github.com/OARANHA/deepharness/actions/runs/38836869201), job `docker` (116767842008) and job `mcp-grants-primary` (116767842078) both passed. Crucially the step **Build primary and verify actual operational Web host with restricted PostgreSQL and mTLS** passed in `docker`; **Verify runtime SELECT privileges and persisted role boundaries on real PostgreSQL** passed in `mcp-grants-primary`. Other successful runs: isolated PostgreSQL revocation 38836869121; isolated alpha compatibility 38836869184; Agent Teams read model 38836869141; isolated Keycloak profile probe 38836869199; identity candidate 38836869159.

**Decision:** Stage B disposable CI integration gate GREEN **for this exact commit SHA**. Do not extrapolate to a later documentation/implementation HEAD without rechecking. No live 28server operational MCP service, grants DB, proxy, public route, OAuth client, ChatGPT session or production cutover was activated by these CI checks.

## Required next technical gates (no production action)

1. Completed for Stage B commit `19d618b`: operational CI and PostgreSQL primary steps are GREEN. Recheck later HEADs after changes; the marker is enforced by the CI harness, though the workflow step summary alone does not display raw logs.
2. Produce an explicit reviewed **single-stack** transition design: original Web must remain available while private MCP host is attached or safely replaced. Keep the proxy's Traefik ingress disabled and maintain zero operational grants. A private runtime `enabled:true` is **not** equivalent to public exposure; isolate it from Traefik routing and require successful official profile boot and authenticated private denial tests.
3. Review exact Portainer environment names, image **digests**, file existence/UIDs, DSH mount reuse, old image and restore procedure without copying actual credentials or BasicAuth values. The exact applied full Git SHA remains unknown; stored original Compose is verified byte-identical to `main` by SHA-256.
4. Rehearse rolling back in disposable CI; require an explicit future owner authorization before changing the existing Portainer stack 90. A separate authorization is required for the real ingress, OAuth, grant and ChatGPT canary.

**No deploy, merge, restart, real listener activation, production DB creation or secret read occurred in this stage.**
