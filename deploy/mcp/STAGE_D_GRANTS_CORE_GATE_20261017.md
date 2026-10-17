# Stage D — persistent grants adapter extraction (review-only)

Date: 2026-10-17. This is a stacked review against `feat/stage-d-agent-teams-read-core-20261017` (Draft PR #8, head `e483774c0157200f4d318e0818b130d8b16aaa64`). This change must **not** be merged or deployed independently of that parent.

## Exact source reuse

Two adapters are byte-for-byte copies from Draft PR #4 branch `feat/chatgpt-mcp-agent-teams-read-model` at head `afcd31418bd6d8cf7d747824cbb29b58a1c8ff75`:
- `integrations/chatgpt-mcp/adapters/scoped-read-grants.mjs`
- `integrations/chatgpt-mcp/adapters/postgres-read-grants.mjs`

The standalone test file and workflow in this PR are new, purposely self-contained Node 22 tests without PostgreSQL, credentials, network or other repo-specific imports.

## Invariants covered in isolated CI

- Exact `issuer#sub`, workspace and Lead tuple; no wildcard; invalid scopes rejected before a query.
- SHA-256 of the canonical JSON tuple in a parameterized SELECT.
- Fresh query every check and a `readFromPrimary:true` **request** to the trusted `query` dependency.
- No implicit grant when missing/disabled, malformed/ambiguous result, backend failure or timeout; AbortSignal requested on deadline.
- No grant mutations exposed through the returned persistent store API; independently executable read model and authorization tests retained.

## Unproven — release blockers

- `readFromPrimary:true` is an adapter **intent**: this unit test does not prove the real `pg` driver always targets a primary. The trusted host must pin PostgreSQL connectivity, verify primary status and enforce reader role with SELECT-only grants.
- No migrations, production grant, DB privilege changes, Keycloak client, OAuth identity mapping, TCP/public listener, production secrets, install/restart/redeploy, container exec, ChatGPT connection or Agent Teams read occur in this branch.
- The running immutable MCP Web image `sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f` still requires a source/CI/build attestation tied to the actual Docker image. A branch test GREEN cannot substitute for that proof.
- Next safe review: add an isolated negative-test bridge connecting trusted request-scoped `issuer#sub` and exact async persistent grants with rechecks across projection awaits. Maintain strict default-deny.

**GO:** isolated source/CI review after parent PR #8. **NO-GO:** merging both changes or altering production without separate authorization.
