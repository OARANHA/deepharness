# DeepHarness — canonical state

Updated: 2026-10-15 UTC

## Current operational checkpoint — 2026-10-15 UTC

This section supersedes the earlier preparation and bootstrap observations below.

- Production target remains **28server**, existing `deepharness-web-1`, protected Web UI and two existing named DSH volumes. No MCP redeploy occurred during the disabled installation.
- Owner-authorized identity exception remains **wandora-vps-01**: permanent administrator with MFA, bootstrap retired, dedicated issuer `https://id.wandora.com.br/realms/deepharness`; actual pinned OIDC/JWKS probe from28server passed after owner aligned the signing-key profile.
- Exact tested host/grants/proxy images were published without rebuilding and pulled on28server. Host: `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`; grants: `ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210`; proxy: `ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877`. [Publication evidence](https://github.com/OARANHA/deepharness/actions/runs/38663108837).
- Owner reported successful runtime secret/internal TLS provisioning and public DNS01 certificate issuance plus renewal dry-run on28server. Renewal scheduling/proxy reload remain pending.
- **Real profile disabled installation succeeded, owner terminal evidence:** `MCP_PREINSTALL_BACKUP_MATCH` then `MCP_EXISTING_WEB_PROFILE_DISABLED_INSTALL_MATCH` from `deploy/mcp/resume-existing-profile-cache-v1.py`. Existing Agent Teams, JEV and browser bundles/dependencies/patches preserved. Original private backup and earlier failure records retained. No MCP listener, Web redeploy or OAuth activation follows from this marker.
- Corrected installer issues: Docker29/containerd incomplete inspect metadata handled by exact approved manifest identity/runtime probe; official immutable DSH executable directory retained in PATH; existing JEV GitHub archive populated into store using its **existing** lock integrity in a network container mounting only the cache. Owner verified subsequent offline reuse. Cache-only procedure did not install packages into the live profile. Existing modules metadata reports pnpm12.11.2/storev11; candidate global pnpm11.28.5. URL-only store-add was not a sufficient offline test.
- All six workflows at `09b834de920d470a6a02c030108ea03576e2ceb6` succeeded. Later helper additions have local verification and owner runtime markers as stated; do not imply every later revision's CI has been rechecked. [CI evidence](https://github.com/OARANHA/deepharness/actions/runs/38680459510).
- **Not yet verified/activated:** operational MCP deployment/listener, proxy route, renewal timer, exact observed ChatGPT callback and dedicated OAuth clients/human account, primary grants DB runtime, one explicit grant and real ChatGPT read canary.
- Next: reconcile existing stack and operational files on28server; prepare reviewed replacement/rollback preserving both volumes and Web authentication; configure exact observed OAuth callback; activate controlled deployment and one authorized read. No second DSH, VPS build, shared Traefik configuration changes or agent execution tools. Connected Portainer must not be assumed to target28server.

## Historical record — retained for provenance



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
