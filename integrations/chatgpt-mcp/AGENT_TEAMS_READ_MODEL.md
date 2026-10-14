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

## Host lock-generation CI preflight — 2026-10-13

The Agent Teams workflow now has an isolated `host-lock-preflight` job
triggered by host-probe changes or workflow changes. It executes
`npm install --package-lock-only --ignore-scripts`, then
`npm ci --ignore-scripts`, and the official published-class surface
preflight. It uploads the generated lockfile as a short-retention artifact.
The job has `contents: read`, does not push or install a production plugin,
and cannot serve as proof of the initialized Cordis/TeamService HTTP gate.
Review the generated lockfile before committing; replace the temporary
generation step with pure `npm ci --ignore-scripts` after publication.
The new CI outcome has not been verified yet.

## Official package preflight GREEN — 2026-10-13

GitHub Actions run 38450609936 job host-lock-preflight completed successfully.
The job generated package-lock.json, completed npm ci with scripts disabled,
and passed the pinned published DSH class-surface preflight. Artifact
dsh-host-probe-lock-preflight (ID 11840516151) was downloaded and inspected:
lockfileVersion 3, seven expected exact direct versions, 127 package entries;
all 126 non-root package entries resolve to registry.npmjs.org with sha512
integrity. The artifact is valid evidence, but the lockfile has NOT yet been
committed to the PR. Do not replace the generation step with npm ci-only
until that exact lockfile is published and read back. Real initialized
Cordis/TeamService HTTP/MCP integration is still untested.

## Exact generated lockfile artifact provenance — 2026-10-13

Recovered GitHub Actions artifact `11840516151` from run `38450609936`
as `package-lock.json`. Uncompressed file: 64,552 bytes; SHA-256
`3c49bd38b4fa5e4a950a88003691f5df217e6004a85612021e5759363254268f`;
lockfileVersion 3 with 127 package entries.

**Do not claim publication:** the authenticated GitHub contents action
accepts a complete UTF-8 payload, not a local ZIP/file path; the file
has not been transferred into that action. The CI generation job remains
read-only and unchanged. Do not grant workflow write permissions merely
to bypass this artifact handoff. Upon committing the exact lockfile,
read back its bytes, verify SHA-256, and only then switch the job to
`npm ci --ignore-scripts` without generation.

## Immutable host-probe lockfile committed — 2026-10-13

The owner uploaded the generated npm v3 lockfile to the repository root
in commit `0a08aff`. The Git blob `7d5dd2dbe6921f740b6e9b96fb1a6e49e8f25f3c`
matches the reviewed 64,552-byte GitHub Actions artifact byte-for-byte;
its SHA-256 is
`3c49bd38b4fa5e4a950a88003691f5df217e6004a85612021e5759363254268f`.
It has now been committed at the correct path
`integrations/chatgpt-mcp/host-probe/package-lock.json`; the accidental
root copy was deleted. The workflow now uses only
`npm ci --ignore-scripts`, with no dynamic lock generation.

**Validation boundary:** the full initialized Cordis/TeamService + SDK
HTTP host integration test still has not been implemented or executed.
The current host-probe file is a published-class API preflight only.
The new HEAD's CI has not been confirmed GREEN. Local npm continues
to return EAI_AGAIN, so no local package execution is claimed.

## Host-bound MCP SDK HTTP integration gate — 2026-10-13

`host-probe/dsh-host-http.test.mjs` now exercises the *real MCP SDK*
Streamable HTTP request lifecycle with the *actual* `createDshHostReadBinding`
rather than only the generic scoped reader. It verifies the DSH
`SessionStore.get`, `SessionProjectionRegistry.snapshot`, and
`WorkspaceRegistry.get` published prototype method presence, and
tests tool enumeration, exact-scope authorization, forged claims,
invalid Bearer/Origin, mid-read revocation and rotation. The pinned
host-probe `npm test` command includes this test.

**Evidence boundary:** workspace registry, live session and Team projection
are still explicit fixtures, not initialized official Cordis services.
This verifies the HTTP SDK + host *binding* path, **not** a real
TeamService-written session log or initialized DSH host. The new CI run
has not been observed. No production plugin, agent execution, shell or deploy.
The remaining gate is constructing a disposable Cordis runtime with official
storage/domain/persistence, live session and TeamService registration,
then repeating this HTTP path without synthetic host service fixtures.

## Official live Session services HTTP step — 2026-10-13

The `host-probe/dsh-host-http.test.mjs` integration now initializes an
official Cordis `Context`, mounts the published `SessionStore` and
`SessionProjectionRegistry` services and creates a real live Session. It
registers an **explicitly test-owned synthetic agentTeam projection**
against the official registry and runs the real HTTP/MCP SDK flow through
`createDshHostReadBinding`. The workspace lookup remains a fixture;
a real TeamService is **not** installed. The test executes no model or agent.

This is a stricter partial integration than the former all-fixture host
probe, but is **not** the requested complete DSH host verification with
official TeamService projection, WorkspaceRegistry, temporary JSONL
persistence and storage domain. The pinned package set also lacks
the independently initialized persistence/storage service dependencies.
Do not claim this gate passed before a new CI GREEN on this HEAD.
Local npm registry remained unreachable, so no local npm test was run.

## Initialized-host dependency preparation — 2026-10-13

A separate `initialized-host-probe` package now pins official
`0.2.1-alpha.2` JSONL persistence, Storage, StorageJson, StorageDomain,
WorkspaceRegistry, Agent, Subagent and TeamService plus Cordis/MCP/Zod.
The dedicated read-only CI prerequisite job generates a reviewable lock
artifact, uses `npm ci --ignore-scripts`, and verifies actual Cordis
SessionStore/SessionProjectionRegistry instantiation and official service
DI declarations. The source-independent npm registry is unreachable in
the local executor (`EAI_AGAIN`); this new job has **not been verified
GREEN**. Its generated lockfile is not yet committed.

**This is not completion of the user-requested full gate.** The probe
does not yet initialize WorkspaceRegistry, TeamService, StorageJson,
StorageDomain or JSONL together, does not bind a TeamService-produced
projection to an HTTP call, and executes no agents/models. Before
advancing, retrieve/validate/commit the generated lockfile, then build
an actual disposable runtime and negative tests using the official
service graph. Never describe a green dependency preflight as full
DSH host integration.

## Initialized-host lockfile committed — 2026-10-13

Owner-uploaded 84,435-byte npm v3 lockfile (159 package records, reviewed SHA-256 `ac4f67959557baf5e6303ca6b0cdf1b95de5ab12bf9d64641ffa4103ec5c451b`) was initially placed at repository root. It has been copied byte-for-byte into `integrations/chatgpt-mcp/initialized-host-probe/package-lock.json` (Git blob `02e9cce8308dbb830d74950b0a81471b2e9eb0fa`), verified by GitHub readback, and the root copy removed. The initialized-host CI job now performs `npm ci --ignore-scripts` from the committed lockfile, without dynamic generation or artifact upload. The new CI has not yet been confirmed GREEN. The full TeamService+WorkspaceRegistry+JSONL runtime test remains outstanding.

## Official disposable TeamService/Workspace/JSONL composition — 2026-10-13

`initialized-host-probe/initialized-host.test.mjs` now adds a second
no-agent test that creates a temporary filesystem root, mounts official
Cordis Storage with official JSON backend and DomainFacility, initializes
official JSONL session persistence, SessionStore, SessionProjectionRegistry,
WorkspaceRegistry and TeamService, then checks that TeamService registered
the authoritative `agentTeam` projection for a live Lead session.

To keep all execution inert, the two service injection dependencies
`agents` and `subagents` are provided as empty test-only façades.
No agent, provider, model, task mutation or production workspace runs.
The new composite test **has not yet passed CI**; its registration and
disposal behavior remain subject to the pinned official packages at the
next run. The read-only MCP HTTP lifecycle test is separately GREEN but
still has its own synthetic Team projection and workspace fixture.
A complete HTTP read driven by this official composed host remains
**not yet proven**.

## Official initialized host → scoped MCP HTTP E2E — 2026-10-13

The isolated `initialized-host-probe/initialized-host-http.test.mjs`
now composes the published Cordis Context, JSON storage backend,
StorageDomain facility, temporary JSONL persistence, SessionStore,
SessionProjectionRegistry, WorkspaceRegistry and TeamService. It creates
one real Lead Session with a temporary cwd, resolves its actual workspace
identity from WorkspaceRegistry, and passes the **actual** Cordis host
to `createDshHostReadBinding` behind the real stateful MCP SDK HTTP
transport. It asserts that TeamService registered the official Lead
projection, then checks the scoped read, forged request fields, wrong
workspace/Lead, wrong bearer/origin, grant revocation and token rotation.

The TeamService dependencies `agents` and `subagents` remain inert
test-only DI services; no model, subprocess, agent or Team mutation runs.
No production transport or remote ChatGPT client is involved.

**New CI status is unverified:** this is committed test code awaiting
runner execution, not yet a demonstrated E2E pass. If CI fails, obtain
the exact failed job log before changing assertions or production code.

## Security review — official workspace detachment gate (2026-10-13)

The initialized official-host SDK HTTP test now also checks a live
`WorkspaceEntity.detachSession(lead.id)` while its Bearer credential and exact
principal/workspace/Lead grant remain valid. It requires the *same MCP session*
to deny the detached Lead without disclosing Team content, then checks
`attachSession` restores workspace membership and explicit grant still governs
the separately tested revoke path. This is test-only fixture mutation via the
official WorkspaceRegistry API. **CI is pending** for this additional test.

Review boundary: no production/real-user host identity integration has been
verified and the DSH Web UI's own authentication is not established by the
service-Bearer bridge tests. External deployment, approval/origin controls,
and per-user identity mapping need separate review before any real ChatGPT
connection. No permission to deploy, merge or expose a public MCP endpoint.

## Trusted transport-verified MCP identity gate (2026-10-13)

`createMcpReadRequestContext` now supports a server-injected
`authenticateTransport(request)` callback as an alternative to the
previous exact service-Bearer credential. Its result must be a validated
`{ principalId, kind: 'individual' | 'service' }` identity. The same
authenticated principal **and kind** must survive every authorization
recheck during a single HTTP request. Exact principal/workspace/Lead
grants, workspace membership, origin validation, active request context
and revocation remain independent mandatory gates. The default path
without the callback still uses the existing exact service Bearer.

The callback is **a trusted server-side integration contract, not an
OAuth verifier**. In particular, ChatGPT identity cannot be accepted
from MCP arguments, an unverified JWT, `X-User` headers, session IDs
or arbitrary client-supplied values. A deployable implementation must
verify issuer, audience, signature and token validity against the
configured identity provider and handle rotation/revocation, with
security review and explicit owner approval before remote use.

The isolated `verified-transport-identity.test.mjs` tests principals,
wrong-target/identity spoofing, same-request identity/kind switching,
malformed assertions, origin and credential rejection and grant
revocation. **New CI is not yet verified.** No real ChatGPT login,
OAuth authorization, external endpoint, merge or deployment is part of
this slice.

## Offline pinned-key JWT verification gate (2026-10-13)

The `pinned-jwt-transport-authenticator.mjs` adapter accepts an **explicitly
provisioned RSA public JWK set** and validates an RS256-signed access JWT
using Node.js crypto. It enforces exact issuer and audience, a known key
ID, JWT type, signature, `sub`, `jti`, `iat`, `nbf`, `exp`, a maximum
one-hour token lifetime and `token_use: 'access'`. A mandatory server-side
`isRevoked` callback must return **exactly false** for each validation;
unavailable revocation checking denies. Successful tokens map to the
individual principal `issuer#subject`, which is independently checked
against an explicit workspace/Lead grant on every read.

The isolated test generates ephemeral RSA keys locally (no private key is
committed) and exercises forged signatures, issuer/audience mismatches,
expired/future tokens, wrong token purpose/algorithm/kid, malformed JWTs,
cross-principal grant attempts and fail-closed revocation.

**Limitations:** this is an offline pinned-key verification primitive,
**not** a complete OAuth 2.0 / OIDC provider integration or ChatGPT login.
There is no OAuth authorization flow, token exchange, network JWKS refresh,
OIDC discovery, key-rotation lifecycle, token revocation backend, or
production ingress. Public-key pinning and `isRevoked` inputs are trusted
server configuration. Integrate only after a separately reviewed issuer,
audience, principal mapping, key provisioning, revocation, resource
authorization and HTTPS design. No secrets, real tokens, merge or deploy.
**New CI execution is pending.**

## Pinned OIDC metadata validation (2026-10-13)

`adapters/pinned-oidc-metadata.mjs` validates **already fetched**
provider metadata against a server-pinned HTTPS issuer and exact,
same-origin JWKS URI; it accepts only RS256 public RSA JWKs with unique
key IDs and refuses private key material, key substitution, unexpected
origins, mismatched issuers and insecure or malformed URLs. The
validated public keys can be fed into the previously tested pinned JWT
authenticator. The isolated negative tests run under the existing
initialized-host CI.

**Do not mistake this for live OIDC discovery or production trust:**
there are no network fetches, redirects, response-size ceilings,
cache/rotation handling, outbound network policy, OAuth authorization
code/PKCE flow, token issuer provisioning or live ChatGPT identity
claims. An OIDC provider's ID-token signing algorithm metadata alone
does not establish an access-token validation profile: issuer-specific
access-token format, key usage, resource audience and revocation must be
documented and independently reviewed before deployment. No new
endpoint, secrets, merge or deployment. **New CI pending.**

## Bounded HTTPS OIDC discovery and rotation cache (2026-10-13)

`adapters/pinned-oidc-discovery.mjs` is a testable **read-only discovery
client**, not an OAuth login. A trusted embedding supplies a pinned issuer,
the exact expected discovery URL and same-origin JWKS URL; metadata cannot
redirect the JWKS request to a new URL. HTTPS fetches request JSON, reject
redirects, cap Content-Length and streamed response bytes, use an abort timeout
and `cache: no-store`. Validated public key sets replace the previous cache
**atomically**, with bounded TTL and single-flight concurrent refresh.

Expired cached keys are **not** returned after an unsuccessful refresh.
Unknown `kid` must not trigger uncontrolled on-demand refreshes; call the
explicit refresh operation only under a reviewed rate limit/rotation policy.
The client does not itself manage OAuth authorization-code/PKCE flows,
authenticate ChatGPT, or rotate live access tokens; it also does not yet
wire refreshed keys into a live per-request JWT verifier.

Security boundary: a trusted issuer URL and same-origin check **do not**
prevent DNS rebinding or access to private IPs. Production deployment must
supply a separately audited network egress policy, DNS/IP verification,
TLS proxy rules, concurrency/rate limits and observability. Injected fetchers
are trusted integration code; current negative tests use simulated responses,
not public network access. No credentials, production endpoint, merge or
deploy. **CI for this new gate remains unverified.**
