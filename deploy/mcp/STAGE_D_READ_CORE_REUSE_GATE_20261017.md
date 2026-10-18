# Stage D — Agent Teams read core reuse (review-only)

Date: 2026-10-17. Repository: `OARANHA/deepharness`.

## Scope and provenance

- Base `main`: `c71c791d7e33084c67198643200764069c1c2668`.
- Source: draft PR #4 `feat/chatgpt-mcp-agent-teams-read-model`, head `afcd31418bd6d8cf7d747824cbb29b58a1c8ff75`. Two transport-independent read helpers and their two self-contained tests were copied byte-for-byte; inspect file blob SHAs or the PR diff before merging.
- Only `agent-teams-read-model.mjs` (bounded read projection), `agent-teams-read-authorization.mjs` (exact principal/workspace/Lead check before read), matching tests and a Node 22 standalone workflow are in scope.
- The test workflow is a CI-only check; it uses no secrets, external databases, production endpoints, network listeners or Docker operations. A GREEN result proves these isolated tests only.

## Independent production-source finding

- `deepharness-web-1` runs `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`; command is `node /opt/wandora-mcp-verifier/mcp/run-operational.mjs`, as observed through sanitized `docker_inspect_safe` on `deepharness-read`.
- Current `main` provides `deploy/portainer-stack.yml` referencing `DSH_MCP_HOST_IMAGE`, but does **not** include `deploy/mcp/run-operational.mjs` or `deploy/mcp/operational-host.mjs`. The draft PR #4 does include these launchers, and its `deploy/Dockerfile.mcp-candidate` copies them into the verifier path.
- This establishes a **source traceability gap**, not proof that production is broken, nor proof of the exact checkout used to build the image. Reconcile immutable GHCR image provenance, packaging inputs and CI source SHA before relying on deployed adapter parity.

## Security and next gates

- **No runtime wiring:** this PR does not register an MCP tool, authenticate OAuth, query the grants PostgreSQL database, perform revocation, or provide an Agent Teams endpoint. Production `mcp-proxy` remains disabled.
- The trusted provider must bind identity independently of caller-supplied arguments; production authorization must verify persistent exact grants and recheck when asynchronous reads complete. The pure helper alone does not meet these requirements.
- Keep PR #4 in Draft; do not merge its unrelated deployment changes into the current `main`.
- Next: establish image source/build attestation, then port narrowly scoped identity/grant/revocation adapters and integration tests, with fail-closed negative paths.
- **NO-GO:** public proxy, Keycloak client enablement, live grants, new Docker privileges, production restart/redeploy or real ChatGPT canary without separate explicit approval.
