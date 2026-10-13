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
`sessionProjections.stateOf(session, 'agentTeam')`. It rejects unregistered
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
