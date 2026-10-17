# Stage D — consolidated read-only integration

Source base: PR #12 `e65ae09e38ccc65402f1f0f7bfb3324d179f57f0`.
Reuse source: PR #4 `afcd31418bd6d8cf7d747824cbb29b58a1c8ff75`.
Integration branch: `feat/stage-d-operational-host-bind-20261017`.
No ADR directory exists in this checkout. Existing project authority and owner mission apply.

## Reuse and changes

Only the runtime/plugin/policy, transitive adapter imports, disabled bundle patch,
SQL table definitions and operational Web/listener/launcher composition were extracted.
No PR4 deployment Compose, provisioner, installer, TLS helper or canary was adopted.
The PR8–12 read/identity/grants adapters remain, with an added startup inspection export
in the strict PostgreSQL seam. `pinned-jwt-transport-authenticator` additionally rejects
tokens expiring while its asynchronous revocation query is pending (RED reproduced).
Independent review also reproduced owning-context provider/policy replacement during
a pending projection. The plugin now compares live original implementations before
and after asynchronous operations, accepting unchanged Cordis trace facades.
The read-only revocation backend exports only `isRevoked`; no INSERT/revoke operation.

`operational-host` now passes the actual `(sql, params, opts)` function returned by
`createAuthoritativePgReadQuery`. Startup inspection is a separate connection using
the same authority predicate; authorization SELECTs remain exact/parameterized.
Every read checkout rechecks role/database, primary, SELECT-only privileges, GUCs,
AbortSignal and effective server deadline. The initialization script for a NEW
candidate DB uses 750ms. Existing databases using 1500ms are rejected; the init script
is not a migration and does not change them. A future role migration needs approval.

## Existing DSH services

The operational launcher boots official `web` once through `runProfile`, using
its existing profile/environment, and mounts only an internal connector service.
It does not construct another Web, SessionStore, workspace registry, Lead or grant.
The existing-profile guard compares original service implementations across Cordis
trace facades. No cold-resume or agent execution is used by reads.

Tests use disposable official Cordis/Workspace/SessionProjection/Team services and
fixture sessions only. TeamService's unused execution dependencies are inert test
fixtures. The launcher test injects the already initialized context and replaces
listener creation with a recording function. This proves composition and service
reuse, not a live Web startup, network MCP handshake, OAuth login or ChatGPT session.
No MCP listener is opened by the new tests. Existing repository bootstrap CI has
its own historical Web smoke gates, separate from this integration.

## Package, candidate and provenance

Package `0.1.0-lab.5` includes the strict adapter and its explicit `./pg-read-query`
export. `npm pack` is tested twice for identical integrity, installed offline,
and every entry/import/export is compared with source bytes. The candidate image
reuses reviewed parent digest `sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`,
checks `pg@8.16.3`, and replaces only the candidate artifact/host code. It resolves
no new runtime dependencies. Its default CMD prints `MCP_CANDIDATE_DISABLED` and exits.
No deployment Compose or existing service is changed to use this image.

CI records exact PR head and tree, tarball SHA256, per-file package hashes, image
config IDs and saved-image checksum. Image source label binds the exact head;
`SOURCE_DATE_EPOCH` binds the commit time. A saved image/config ID is not a registry
manifest digest. No registry image is published by this workflow. Publication and
comparison with any deployed digest require a later gate.

Before imports the opt-in launcher compares the persistent installed package against
the candidate's per-file manifest, rejecting stale/modified bundles. Candidate images
alone never upgrade a volume-backed profile. Existing installed lab.4 will fail this
check until a separately reviewed disabled package upgrade has been performed.

## Verification and review gate

Local: Node 24 environment; run `npm test --prefix integrations/chatgpt-mcp` plus
`node --test deploy/mcp/operational-host.test.mjs deploy/mcp/existing-profile-host.test.mjs`.
CI: `.github/workflows/stage-d-pg-primary-disposable.yml`, Node 22, locked official
DSH alpha.2 dependencies, `pg@8.16.3`, disposable PostgreSQL16.6; then both image builds.
Covers signed individual/sub/issuer/audience/scope/time/origin, exact workspace/Lead,
no implicit grants, server SQLSTATE57014, write denial, real lock timeout and abort,
late-result rejection/client discard, token and grant revocation after asynchronous
projection, database privilege loss, primary/role/GUC checks and unsafe1500ms denial.

Do not mark ready until both jobs pass on the final SHA and saved artifacts exist.
Keep one consolidated Draft stacked on PR12. No merge, deploy, production role/grant,
Keycloak/credential change, listener activation or ChatGPT canary is authorized here.
Next owner gate after development review: approve the concrete activation/canary
packet including disabled profile upgrade, timeout migration and rollback.
