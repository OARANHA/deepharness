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
