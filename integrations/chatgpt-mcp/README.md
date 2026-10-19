# Private Agent Teams connector and internal bridge

Engineering package `@wandora/deepharness-chatgpt-mcp-read`, lab.7.
The installed MCP OAuth path remains read-only and exposes only
`dsh_read_agent_team`, authenticated through signed individual JWT identity
and explicit PostgreSQL principal/workspace/Lead grants. A separate opt-in
internal mTLS route now has a strict semantic adapter for listing Agent Teams,
reading bounded text chat, and queuing text instructions through the official
DSH SessionController. It is disabled unless an operator configures one exact
Remote-Ops client certificate fingerprint.

- `runtime.mjs`: request-scoped authentication, exact grants and live read binding.
- `plugin.mjs`: mounts only an internal service on existing Cordis dependencies.
- `policy.mjs`: trusted host configuration; persistent grants with no fallback.
- `adapters/dsh-semantic-bridge.mjs`: exact workspace membership, Team Lead projection, bounded history and queued text prompt over official DSH APIs.
- `adapters/private-semantic-http-handler.mjs`: fixed internal JSON operation allowlist, mTLS peer fingerprint pin, bounded requests/responses and content-free audit events.
- `adapters/authoritative-pg-read-query.mjs`: per-checkout role/primary/GUC/deadline
  validation and exact parameterized reads; opt-in startup inspection export.
- `cordis.patch.yml`: bundle disabled and endpoint disabled by default.

No module import starts a listener. `deploy/mcp/run-operational.mjs` is a separate
operator opt-in launcher; no active runtime configuration is provided here.
Default candidate image CMD exits with `MCP_CANDIDATE_DISABLED`.
The bridge is not wired to Remote-Ops in this change, has no provisioned client
certificate/grants, and has not been enabled or exercised against a real DSH
session. Admission by `SessionController.prompt` confirms queue acceptance,
not completion; read the Lead response separately through the bounded history
operation.

Run `npm test --prefix integrations/chatgpt-mcp` for isolated package/runtime tests.
The locked `pg-disposable-probe` runs only in this repository's disposable CI,
using official DSH service fixtures, fixture sessions and pg8.16.3/PostgreSQL16.6.
It is not a production installation command or proof of ChatGPT login.

Full source reuse, artifact provenance, operational host tests, limitations and
future activation gates: `deploy/mcp/STAGE_D_INTEGRATION_REVIEW_20261017.md` and
`deploy/mcp/DEEPHARNESS_SEMANTIC_BRIDGE_DRAFT.md`.
