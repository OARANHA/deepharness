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

## Strict next gates
A. Verify source-import workflow outcome, LICENSE, source tree and pinned source SHA.
B. Verify full Web UI runtime smoke in PR CI and record the next immutable GHCR digest.
C. Inventory existing DeepSeek-specific Docker container/image/volumes/config and preserve data before cutover.
D. Deploy exactly one Portainer Stack using already-built image.
E. Validate origin TLS and authenticated Web UI; integrate Chutes.ai.
F. Design least-privilege MCP plugin; no unrestricted host execution.
