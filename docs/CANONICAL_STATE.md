# DeepHarness — canonical state

Updated: 2026-10-12

## Verified
- `OARANHA/deepharness` existed as an empty public GitHub repository with write access before setup.
- Origin `deepseek-ai/deepseek-harness`, branch `master`, pinned import target in `UPSTREAM.md`.
- Earlier hand-built Docker container on `28server` experienced restart loop with `No usable prebuilt binary found in linux-x64-gnu`.
- Last known public route `deep.wandora.com.br` failed with Cloudflare HTTP 526 and Traefik default certificate.

## Intended, not yet proved
- Source snapshot import from pinned upstream commit.
- GHCR image built/tested in GitHub Actions, published with digest.
- Replacement Portainer Stack running on `28server`.
- Valid TLS, working Web UI, workspace, Chutes.ai models.
- Private ChatGPT ↔ MCP ↔ DeepSeek Harness connector.

## Strict next gates
A. Verify source-import workflow outcome, LICENSE, source tree and pinned source SHA.
B. Verify CI and native-loader smoke result, and GHCR digest.
C. Inventory existing DeepSeek-specific Docker container/image/volumes/config and preserve data before cutover.
D. Deploy exactly one Portainer Stack using already-built image.
E. Validate origin TLS and authenticated Web UI; integrate Chutes.ai.
F. Design least-privilege MCP plugin; no unrestricted host execution.
