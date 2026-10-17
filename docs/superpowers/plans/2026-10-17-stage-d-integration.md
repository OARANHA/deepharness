# Stage D integration plan

Goal: finish the existing read-only MCP composition in one branch based on PR #12.
Spec: owner's Work mission, 2026-10-17; `deploy/mcp/STAGE_D_INTEGRATION_REVIEW_20261017.md`.
Execution: native, autonomous, authorized by owner; final review remains Draft.

- [x] Reconcile PR12 head and prior security refusal; branch creation through the same GitHub connector succeeded. No alternate write route used.
- [x] Extract only the PR4 runtime/plugin/policy, transitive adapters and Web launcher dependencies; retain parent read/identity adapters.
- [x] Wire the strict query, separate startup authority inspection, enforce 750ms candidate role, remove revocation writes from the read backend.
- [x] Add real-driver/official-service composition tests and package byte/provenance checks, leaving listener calls behind DI seams in tests.
- [x] Add a digest-pinned image candidate, disabled default CMD, source/artifact manifest, and one integrated workflow.
- [x] Verify integrated PostgreSQL and candidate image jobs on frozen sourcef5a5a4f7; runs39004711244/39004711250 SUCCESS.
- [x] Persist Draft PR, CI/artifact evidence and publication39005661347 in central memory.

Review focus: stale persistent installed package; missing opts; asynchronous revocation; token expiration during DB lookup; differing effective GUCs on new connections. Tests cover each. Real deployment/login is explicitly out of scope.

## Private profile rehearsal follow-up

Spec: `deploy/mcp/PRIVATE_PROFILE_REHEARSAL_20261017.md`; owner asks to advance
preparation, not real deployment. Runtime remains frozenf5; new helpers are mounted
for the isolated rehearsal and do not enter or republish that image.

- [x] Use confirmed /data/dsh profile paths; preserve absent home patch; never copy sessions/workspace/global credentials.
- [x] Add guarded `private-profile-rehearsal.mjs` consuming frozen preservation/provenance exports and invoking only offline install/config dump. Negative ordinary-execution test RED→GREEN.
- [x] Add owner wrapper for private snapshot/copy, fixed published image, disconnected non-root container, source hash/Web-baseline readback. No live write mounts or cleanup.
- [x] Add synthetic copied-profile positive CI path with absent home patch and matching relocated cache metadata/environment. Local82tests/Python4tests/bash+YAML pass.
- [ ] Verify positive rehearsal helper in CI on exact new control SHA. Do not ask owner to execute until that passes.
- [ ] Owner executes private real-profile rehearsal, then prepare separately approved consistent backup/maintenance/rollback. No production mutation is part of these helpers.

Review focus: old absolute pnpm store paths in relocated CI fixture; unreadable/dangling cache links; missing home patch; unexpected active connector composition; accidental source/live-volume writes. CI fixture metadata relocation applies only to synthetic inputs; real copy retains /data/dsh.
