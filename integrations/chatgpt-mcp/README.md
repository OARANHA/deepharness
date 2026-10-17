# Private Agent Teams read connector

Review-only package `@wandora/deepharness-chatgpt-mcp-read`, lab.5.
This is an internal read integration for one existing official DSH alpha.2 Web
profile. It provides only `dsh_read_agent_team`, authenticated through signed
individual JWT identity and explicit PostgreSQL principal/workspace/Lead grants.
It does not add a model to DSH or provide agent/session/grant mutation tools.

- `runtime.mjs`: request-scoped authentication, exact grants and live read binding.
- `plugin.mjs`: mounts only an internal service on existing Cordis dependencies.
- `policy.mjs`: trusted host configuration; persistent grants with no fallback.
- `adapters/authoritative-pg-read-query.mjs`: per-checkout role/primary/GUC/deadline
  validation and exact parameterized reads; opt-in startup inspection export.
- `cordis.patch.yml`: bundle disabled and endpoint disabled by default.

No module import starts a listener. `deploy/mcp/run-operational.mjs` is a separate
operator opt-in launcher; no active runtime configuration is provided here.
Default candidate image CMD exits with `MCP_CANDIDATE_DISABLED`.

Run `npm test --prefix integrations/chatgpt-mcp` for isolated package/runtime tests.
The locked `pg-disposable-probe` runs only in this repository's disposable CI,
using official DSH service fixtures, fixture sessions and pg8.16.3/PostgreSQL16.6.
It is not a production installation command or proof of ChatGPT login.

Full source reuse, artifact provenance, operational host tests, limitations and
future activation gates: `deploy/mcp/STAGE_D_INTEGRATION_REVIEW_20261017.md`.
