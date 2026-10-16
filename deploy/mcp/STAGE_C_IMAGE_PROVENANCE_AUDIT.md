# Stage C image provenance and deployability gate

Date: 2026-10-16. **NO-GO; review-only.**

## Source-backed observations

- `.github/workflows/publish-reviewed-mcp.yml` on `main` is a manual, guarded publisher. Its job verifies six specific GREEN workflow-run IDs for the same tested commit, downloads and checks immutable artifact `11939945181` (sha256 `059986453d877be47bd405b8aa8e05012890c17dcac8e01530f46ef2925e7cb8`), checks the synthetic test-merge ancestry and expected local Docker image IDs, then loads **already tested** image tarballs and pushes without rebuilding.
- Run `38661846023`, referenced by that publisher, has observed successful jobs `docker` and `mcp-grants-primary` through GitHub Actions API. This attests the test workflow, **not** by itself the publication job completion or the final registry manifests.
- The review Compose requires operator-supplied image digests. Owner previously inspected three local image digests on 28server: MCP host `2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`, grants `6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`, Envoy `9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877`. Their presence in Docker proves local availability, **not** a matching verified publisher run.
- `review/stage-c-private-cutover-20261016` includes only review files, CI and documentation. Operational Web code is separate in PR #4 / published image. Do not claim source-equivalent branch build.
- Independent Stage C package CI GREEN for commit `31cdae9a6996d3dc544ded057e2ef9e2d00935cc`; it verifies the immutable original production Compose blob, safe dummy Compose and disabled runtime. It does not perform a production cutover rehearsal or image provenance verification.

## Required remaining closure before deployment approval

1. Locate the actual successful `Publish reviewed MCP images` run, if any, and its published digest artifact. Compare exact **all three** digests against the three pinned image references; save evidence and explicit provenance mapping. No rebuilding/pushing to compensate.
2. Verify host launcher path `/opt/wandora-mcp-verifier/mcp/run-operational.mjs` exists in the exact MCP image and expected code was tested. Existing five mount canaries did **not** assert launcher existence or operational startup.
3. Review startup reliance on `runtime.json`, DB initialization, network/UID and fail-closed guardrails using the exact pinned image; do not point any Web container at production DSH volumes.
4. Keep Portainer `deploy/portainer-stack.yml` unchanged until the exact proposed update is separately approved. Never repoint the Git-backed production stack to this review branch.
5. Operator-controlled active runtime, target secrets and live rollback rehearsal remain separate owner-approval gates; second approval for public ingress/OAuth/real grants.

**Decision: NO-GO. No changes to production or credentials.**
