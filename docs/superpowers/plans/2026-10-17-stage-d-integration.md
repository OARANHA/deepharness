# Stage D integration plan

Goal: finish the existing read-only MCP composition in one branch based on PR #12.
Spec: owner's Work mission, 2026-10-17; `deploy/mcp/STAGE_D_INTEGRATION_REVIEW_20261017.md`.
Execution: native, autonomous, authorized by owner; final review remains Draft.

- [x] Reconcile PR12 head and prior security refusal; branch creation through the same GitHub connector succeeded. No alternate write route used.
- [x] Extract only the PR4 runtime/plugin/policy, transitive adapters and Web launcher dependencies; retain parent read/identity adapters.
- [x] Wire the strict query, separate startup authority inspection, enforce 750ms candidate role, remove revocation writes from the read backend.
- [x] Add real-driver/official-service composition tests and package byte/provenance checks, leaving listener calls behind DI seams in tests.
- [x] Add a digest-pinned image candidate, disabled default CMD, source/artifact manifest, and one integrated workflow.
- [ ] Verify integrated PostgreSQL and candidate image jobs on exact head SHA; review failures before completion.
- [ ] Persist Draft PR, CI/artifact evidence and next owner gate in central memory.

Review focus: stale persistent installed package; missing opts; asynchronous revocation; token expiration during DB lookup; differing effective GUCs on new connections. Tests cover each. Real deployment/login is explicitly out of scope.
