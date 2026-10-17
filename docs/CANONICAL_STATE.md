# DeepHarness — canonical state

Updated: 2026-10-12

## Verified
- `OARANHA/deepharness` existed as an empty public GitHub repository with write access before setup.
- Origin `deepseek-ai/deepseek-harness`, branch `master`, pinned import target in `UPSTREAM.md`.
- Earlier hand-built Docker container on `28server` experienced restart loop with `No usable prebuilt binary found in linux-x64-gnu`.
- Last known public route `deep.wandora.com.br` failed with Cloudflare HTTP 526 and Traefik default certificate.

## Verified CI artifact (not a deploy)
- Published image: `ghcr.io/oaranha/deepharness@sha256:450f80d53933b1e9ed41c767191042bd4e0d7b1dafc8df8bd7c5426f9fc5228b` (commit `a57007d002a96f7a44e18f7d4f9c0b371f0cccc1`, green build/native-addon smoke, run #38319795132).
- A green native-addon smoke does NOT prove the Web UI serves HTTP or remains stable.

## Intended, not yet proved
- Source snapshot imported from pinned upstream commit (import workflow and LICENSE/package.json verified).
- Full Web UI runtime smoke test and next GHCR release from a green, reviewed change.
- Replacement Portainer Stack running on `28server`.
- Valid TLS, working Web UI, workspace, Chutes.ai models.
- Private ChatGPT ↔ MCP ↔ DeepSeek Harness connector.

## Last verified CI gate
- PR #1 Web smoke run `38321434997` completed with **failure**: Docker build and isolated native-addon probe succeeded, but DSH exited before HTTP became available (`container state=exited`, `exit_code=1`). The first workflow did not emit application logs, therefore cause is **unknown**.
- Follow-up commit `dae15d6164b44a9565aba227c36588f890b689e7` adds sanitized startup logs to the same PR (not a proven fix). No production cutover until diagnosis, then green smoke.
- The earlier published image digest `sha256:450f80d53933b1e9ed41c767191042bd4e0d7b1dafc8df8bd7c5426f9fc5228b` remains from the native-only checks and must **not** be promoted to Portainer.

## PR #1 reproduced startup failure (verified 2026-10-12)
- Run #38321939900 failed after addon smoke **success**; application logs revealed `error: unknown option '--public-url'`. The npm distribution `@deepseek-ai/dsh@0.2.0-rc.2` does not recognize this flag, although newer upstream docs mention it.
- Fix proposed in this PR: remove **only** `--public-url` from container CMD; retain `--trusted-host deep.wandora.com.br`, concrete bind IP, non-root execution and all security restrictions. Must rerun full Web UI startup smoke before merge; publication skipped on failure.
- The historical Dependabot `npm_and_yarn in /` job was still running on old upstream-import commit after `.github/dependabot.yml` was removed. It is not a DSH build or 28server process. Cancel it via Actions UI if needed.

## CI red: pinned npm rejects container-specific bind IP (verified 2026-10-12)
- Run #38322385643, job #115053233774, built image and passed native addon probe, but failed the Web UI smoke. Sanitized logs: `webserver (required) ValidationError: $.host expected "127.0.0.1" | "0.0.0.0" but got "172.17.0.2"`. Thus the package `@deepseek-ai/dsh@0.2.0-rc.2` does not permit a concrete Docker bridge IP for `--host`; its runtime behavior differs from current upstream public-deployment documentation.
- Proposed targeted fix on PR #1: use direct exec-form `CMD ["dsh","web","--no-open","--port","3080","--host","0.0.0.0","--trusted-host","deep.wandora.com.br"]`. Keep container **without published port**; only Traefik on isolated Docker network may reach 3080. This is **untested until PR CI is green**, and is not a change to 28server.

## Alpha release evaluation (not a Portainer deploy)
- **Why old version is blocked:** CI #38322682966 proved that the pinned RC intentionally rejects wildcard remote binding to prevent network exposure of code execution tools. This guard must not be disabled.
- **Scoped change in PR #1:** switch to official npm package `@deepseek-ai/dsh@0.2.1-alpha.2` but run Web UI **only on 127.0.0.1** inside a `--network none` CI container. HTTP checks run by `docker exec`, not from the runner network. No `--public-url`, `--trusted-host`, or Traefik exposure in this test.
- **No release authorization:** passing this local smoke would show the alpha can bootstrap with an isolated listener, **not** that it is safe for internet access. The public Portainer Stack remains blocked until a separate explicit security review, protected ingress design, valid origin TLS and reviewed immutable image. No automatic production upgrade from this result.
- Verified alpha upstream source (for comparison): `https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/packages/bundle/web-app/src/startup.ts`.

## Strict next gates
A. Verify source-import workflow outcome, LICENSE, source tree and pinned source SHA.
B. Verify full Web UI runtime smoke in PR CI and record the next immutable GHCR digest.
C. Inventory existing DeepSeek-specific Docker container/image/volumes/config and preserve data before cutover.
D. Deploy exactly one Portainer Stack using already-built image.
E. Validate origin TLS and authenticated Web UI; integrate Chutes.ai.
F. Design least-privilege MCP plugin; no unrestricted host execution.

## Stage D integration candidate — 2026-10-17 (review only)

The preceding historical deployment notes do not describe the latest integration.
See `deploy/mcp/STAGE_D_INTEGRATION_REVIEW_20261017.md` for the narrow PR12-based
composition, reuse provenance, tests and packaging gates. The operational host
uses the strict PostgreSQL query and candidate role timeout750ms. Package and
image candidates remain disabled; real production deployment/login is unverified
by this change. CI must be checked on the exact integration SHA before readiness.
