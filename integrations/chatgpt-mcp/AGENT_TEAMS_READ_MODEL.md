# Agent Teams read-model slice (no transport)

Source of truth: DeepSeek Harness pinned upstream
`d743267388641bc76f17c45ce8b4c231aed1d32c`,
`docs/subsystems/agent-team.md` and
`packages/experimental/agent-team/src/types.ts`.

## Proven data contract
The root/Lead Session exposes `SessionProjectionMap.agentTeam` with durable
`members`, task views and optional `failure`. This is not a new RPC and
does not require invoking Team mutators. Child running state and model labels
come from separate Session projections; this slice does not fabricate them.

## Delivered in this PR
`adapters/agent-teams-read-model.mjs` maps an **already authorized**
projection into detached members/tasks. It checks the exact Lead identity,
rejects projection replay failure, duplicate member/task identities,
incorrect Lead role/phase, dangling/duplicate/self-referential dependencies
and cyclic task graphs, and bounds the input arrays. It selects only known
output fields; unknown input fields are not passed through. It does not read
session storage, use Web cookies, access a gateway, or start an MCP listener.
The new isolated unit test and CI workflow exercise these checks.

## Security gates still required
- Authenticate a caller through the reviewed transport and authorize the
  specific Lead Session/workspace, **before** retrieving or transforming data.
- Prove that both membership and task content are authorized at the same
  security boundary; no cross-session enumeration and no default all-workspaces.
- Prove safe handling of projection updates and cold sessions through an
  official host API, without impersonating a Lead or bypassing DSH authorization.
- Preserve bearer authentication, Web origin protections, approval semantics,
  negative tests and fail-closed behavior.
- Package a separate reviewed alpha-compatible bridge. This read-model module
  is **not** a bridge release and exposes no tools to ChatGPT.
- No production installation, merge or Portainer deployment in this slice.

## Status
The parent PR #3 provides an isolated alpha compatibility probe only.
This PR is stacked as Draft pending isolated CI and review. No real user
session, secret, model request or server endpoint is involved.

## Authorization contract boundary (2026-10-13)
A separate `adapters/agent-teams-read-authorization.mjs` now requires the
**trusted provider** to prove exact principal equality, workspace equality,
explicit Lead identity, and `canReadTeamProjection === true` before it may
fetch a projection. Rejected requests must perform zero projection reads.
Tests exercise denial for missing/mismatched identities and wrong workspaces.

**IMPORTANT: this is not actual DSH authorization integration.** The
`resolveAuthority` / `readProjection` provider remains unimplemented;
calling code must bind `resolveAuthority` to the transport-authenticated
principal (never caller-controlled) and resolve workspace/session ownership
through an officially supported host service. The current bridge bearer token
alone is not proof of workspace access. Never accept an authority object from
MCP tool arguments. Host-backed negative tests, revocation/concurrency
semantics, and explicit review remain required before registering MCP tools.

## DSH host-service binding prototype

`adapters/dsh-agent-teams-host-reader.mjs` now uses the **verified upstream
service shapes** `workspaceRegistry.get(workspaceId).sessionIds` and
`sessionProjections.snapshot(session, ['agentTeam']).values.agentTeam`. It rejects unregistered
workspaces, sessions not attached to that workspace, missing projections or
missing live session handles. It invokes the host-provided authorization policy
**before** session access and **again** after asynchronous session resolution
to deny a revoked/detached request. It does not cold-resume a session.

This is still a **dependency-injected prototype, not a wired DSH identity
provider**. The pinned DSH WorkspaceRegistry verifies session membership via
persisted header/canonical cwd, but does **not** expose a per-principal access
decision. Thus `authorizePrincipal` and `principalFromTransport` must be
supplied by a separately audited authenticated integration; the connector
cannot infer a user's permission from workspace membership or knowledge of a
session ID. Current tests use stubs of those callbacks and DSH service method
shapes, **not** an authenticated DSH production host. No MCP endpoints are
registered, no write-capable Team methods are called, no deployment permitted.

## Revocation boundary hardening

The host reader checks trusted access at admission, after loading the live
Lead, **and after projection resolution**, denying a permission revoked
during any asynchronous interval before materializing the read model.
A negative test uses a deferred projection and revokes policy while it is
pending. This is a safety boundary within the testable host adapter; it
does not eliminate the need for a production-grade transactional authority
check if DSH changes the session between the last check and response.

## Explicit identity gate for a future MCP transport

**Not implemented:** DSH's `WorkspaceRegistry` validates Session
membership against persisted headers but has no principal ACL. Its
`sessionProjections` service provides the Team projection, not an access
decision. The upstream bridge's bearer authentication validates possession
of a bridge token, not identity and authorization to an arbitrary workspace.
Therefore a server-bound principal and an explicit scoped grant registry
must be designed and reviewed before tools can be exposed. No principal,
workspace, or `canRead` flag may be accepted in MCP tool arguments.
An absent or revoked grant must return denied, not fall back to all-workspaces.

Do not treat CI here as production identity integration or as a deploy gate.

## Server-bound scoped identity composition (2026-10-13)

`scoped-mcp-read-identity.mjs` composes the host reader with two trusted
server dependencies: `authenticateRequest(actualServerRequest)` and
`hasReadGrant({ principalId, workspaceId, leadSessionId })`.
The former must validate the incoming Bearer credential against the server's
current authentication policy; the latter must consult explicit current grants.
Tool arguments supply target IDs only, never identity or permissions.
A shared token represents a configured service principal, not a human user.
Authentication, stable principal binding and exact grants are checked at each
host authorization boundary and again after model materialization.
Exceptions, absent identity and non-boolean grants deny access.

**Remaining gate:** this is a server-only composition with injected dependencies,
not a wired HTTP endpoint or a new credential store. Tests use a trusted
authentication fixture, not the upstream HTTP Bearer implementation.
The embedding server must supply reviewed authentication and grant providers,
pass its real request separately from tool arguments, preserve existing Bearer,
origin and approval gates, and verify end-to-end negative cases before exposure.
No DSH per-workspace ACL is inferred. No deployment or write operation is added.
Revocation is checked before returning; transport delivery after that boundary
requires server lifecycle handling and is not an atomic grant transaction.

## Bearer credential verification adapter

`bearer-scoped-team-reader.mjs` now supplies an implemented authenticator:
it compares the actual Authorization header with the current server credential
using Node timingSafeEqual, rejects absent/invalid credentials and authMode none,
and binds successful possession only to the configured service principal.
The currentCredential callback is reread at each check, permitting rotation.
No credential is persisted or exposed by this adapter. Tests generate ephemeral
random credentials and cover invalid headers, scopes and mid-read rotation.

**Still not HTTP/MCP wiring:** the pinned upstream src/http.ts authenticates
requests but does not pass IncomingMessage into tool callbacks. Its wildcard
CORS is not proof of origin protection. A reviewed request context propagation
and origin gate remain required before registering this reader as an MCP tool.
The grant backend remains an explicit server-owned hasReadGrant dependency,
not a DSH ACL. No endpoint, session transport or approval policy is changed.

## Server-owned exact grant registry

`createScopedReadGrants()` now implements the hasReadGrant dependency.
It defaults to no permissions, copies validated principal/workspace/Lead tuples,
rejects wildcard grants, bounds entries and uses collision-free tuple keys.
Trusted replace/revoke operations take effect immediately; malformed replacement
is rejected atomically while preserving the prior policy.
The registry is in memory only; restart denies unless the server supplies an
explicit reviewed configuration. These management methods must never be
registered as MCP tools or fed by tool arguments. No credentials are stored.
The composed Bearer reader is tested against the actual registry with revocation
while an asynchronous projection is pending.

Transport wiring, trusted runtime policy provisioning, origin protection and
HTTP/MCP end-to-end verification remain pending. This is not a production ACL
deployment, and no endpoint has been exposed.

## HTTP request context binding

`createMcpReadRequestContext` composes implemented Bearer authentication,
server-owned exact grants, and an AsyncLocalStorage context per dispatch.
It admits only explicit allowed Origin values; missing Origin is denied unless
the server explicitly sets allowMissingOrigin=true for non-browser clients.
CORS headers alone are not authorization. Invalid credentials/origin never
invoke dispatch. A snapshot of server headers is bound to the configured service.
Callbacks outside dispatch or inherited after dispatch completes fail closed.
Concurrent request contexts are isolated. Administrative grant methods remain
server-only and are not MCP tools.

Integration contract for a reviewed bridge overlay:
- Construct one binding from trusted runtime credentials, origins and grants.
- Register binding.readTeam as the read-only Team callback.
- Wrap BOTH fresh and existing session transport.handleRequest calls with
  binding.runHttpRequest(req, () => transport.handleRequest(req, res, parsedBody)).
- Do not rely on initialization/session ID as persistent authentication.
- Preserve other approval, lifecycle and host restrictions. Do not expose
  upstream mutation tools through this read-only slice.

57 local tests pass, including actual loopback HTTP requests through this
boundary. **These are not MCP SDK end-to-end tests:** the upstream submodule
is unchanged, and no production tool is registered. The SDK's async dispatch
lifetime and context propagation must be verified in a separate isolated
integration before claiming the HTTP/MCP bridge is wired.

## MCP SDK stateful HTTP gate — verified locally

The isolated sdk-probe pins the bridge's exact SDK 1.30.0 and zod 4.4.3
with a dependency lockfile and disabled install scripts. It runs a loopback
HTTP server, initializes a real StreamableHTTPServerTransport session, lists
the sole registered dsh_read_agent_team tool and calls it through JSON-RPC.
registerScopedTeamReadTool provides the read-only callback, generic denial
without raw host errors, and read-only tool annotations.

Verified with the real SDK: per-request AsyncLocalStorage context survives
fresh and existing session dispatch. Invalid Bearer/origin rejects dispatch;
wrong workspace/Lead and forged principal arguments return denied without
projection access. Grant revocation during a pending read denies output.
Token rotation rejects the old token even on an existing MCP session.
Only this read tool is registered: no agent execution or mutation tools.

Local evidence: 57 adapter tests plus 1 SDK integration scenario passed
on Node 24.19.0. CI additionally runs this scenario on Node 22.
The HTTP test harness is disposable test code, not a production listener.
**Remaining:** host services are fixtures, not a live DSH Team. A reviewed
bridge overlay must connect the runtime services, provision trusted grants,
wrap all HTTP dispatches and preserve origin/approval restrictions.
The upstream submodule and deployment remain unchanged. Passing this gate
does not authorize exposing the upstream bridge's other tools or deployment.

## Alpha contract correction — 2026-10-13

The earlier host prototype used stateOf as though it returned the client view.
This was incorrect and the earlier fixtures masked the mismatch.
Official alpha source packages/session/session-projection/src/index.ts shows
stateOf returns SessionProjectionStateMap host state, while snapshot returns
schema-validated SessionProjectionMap client values. Agent Teams projection.ts
adds the implicit Lead, member roles and derived task fields only in wire.view.

The host reader now requires snapshot and selects only values.agentTeam.
It does not transform raw state or fall back to stateOf. Missing Team capability
denies access. A regression test reproduces the former error by making stateOf
throw and serving the official client envelope from snapshot.
All fixtures now explicitly model this envelope using a test-only helper.
58 local adapter tests and the real MCP SDK scenario pass after the correction.

Source: https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/packages/session/session-projection/src/index.ts
Source: https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/packages/experimental/agent-team/src/projection.ts

This verifies the documented alpha API contract, not a running real DSH host.
The remaining runtime host/plugin binding gate is unchanged.

## Official-host binding preparation — 2026-10-13

`adapters/dsh-host-read-binding.mjs` now composes the already-tested scoped
request reader against an existing host's `workspaceRegistry.get`,
`sessions.get`, and `sessionProjections.snapshot` contracts. It rejects
missing host services, stale/swapped session handles, and service replacement
before projection. It starts no server, does not resume a session, and
registers no write tools. A separate four-case contract test has been added
to the existing read-model CI job.

**Evidence boundary:** these added tests are synthetic host-shape fixtures.
The previous session reported a passing uncommitted host probe using actual
DSH 0.2.1-alpha.2 Cordis/SessionStore/SessionProjectionRegistry/TeamService
instances, but its scratch files were not available on this session. No
reproduced official-host probe or npm lockfile is committed here yet.
Consequently this commit is *not* the finished official-host CI gate.
The new workflow outcome must be reported by the repository owner; no CI
polling or production runtime test is claimed.

**Next step:** reconstruct the isolated pinned DSH host-probe with
`npm ci --ignore-scripts`, an immutable lockfile, actual service composition
and an HTTP/MCP SDK roundtrip. Require green CI and readback before treating
the official-host gate as closed. No merge, deploy or plugin installation.

## Host service replacement guards — 2026-10-13

The host binding now checks that all three service instances still match the
original Cordis context at each workspace membership query and snapshot
invocation, not just when it first finds the live Lead. The existing
authorization path rechecks membership after the asynchronous projection
resolves. Additional fixture tests cover replacement during a pending
projection and before admission. These tests are committed but their new
CI outcome has not been confirmed by the owner.

The official DSH host probe remains **not reconstructed**. npm registry
resolution was unavailable in this execution environment, so no dependency
lockfile or actual-host npm test result is claimed. Do not use an unpinned,
dynamically generated dependency tree to bypass that missing verification.

## Asynchronous Lead replacement hardening — 2026-10-13

The official-service-shape binding now rechecks the exact live Session object
after `sessionProjections.snapshot` resolves. If `sessions.get(id)` changes
while the snapshot is pending, it denies the read rather than returning a
stale Team. A regression test using a deferred synthetic projection is in
the PR. This does **not** constitute a real initialized DSH host probe.

The isolated official DSH 0.2.1-alpha.2 host-probe with pinned npm lockfile
and a dedicated `npm ci --ignore-scripts` CI job is still pending: the
local execution environment could not resolve `registry.npmjs.org`
(`EAI_AGAIN`). The CI on this new HEAD must be explicitly verified before
claiming its regression test passed. No production integration or deploy.

## Official DSH probe preflight prepared — 2026-10-13

`host-probe/package.json` now pins the published DSH session,
session-projection, workspace and Agent Teams packages to
`0.2.1-alpha.2`, Cordis to `4.0.5-alpha.1`, and MCP SDK/Zod to
`1.30.0`/`4.4.3`. A separate preflight test checks the official
published class method/DI surfaces. **No npm package lock has been
generated and the preflight has not been executed.** The runtime
cannot currently resolve registry.npmjs.org (EAI_AGAIN), and its npm
cache has no relevant packages. Do not run `npm ci` or wire this
preflight into CI until the lockfile is safely generated and read back.

The full host-service HTTP/MCP integration scenario is NOT delivered:
it still requires initializing the official Cordis services, storage,
JSONL persistence, projection registration and TeamService in isolated
temporary directories, then a real SDK roundtrip and negative grants.
The published preflight is a preparation step, not evidence of that gate.
