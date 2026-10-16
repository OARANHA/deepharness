# DeepHarness — project source of truth

## Scope
- **Owned repository:** https://github.com/OARANHA/deepharness
- **Upstream:** https://github.com/deepseek-ai/deepseek-harness (`master`; MIT licensed)
- **Deployment target:** ONLY the `28server` VPS (`158.220.97.145`).
- **Production surface (pending):** `https://deep.wandora.com.br` behind existing Cloudflare + Traefik; **Portainer Stack**, not shell-driven iterative builds.
- **Models:** Chutes.ai as a custom compatible provider, configured in the DSH UI only after healthy bootstrap and trusted HTTPS.
- **Long-term integration:** authenticated MCP plugin to allow ChatGPT to read/manage permitted DeepHarness capabilities through an ACP/SDK adapter. No unrestricted shell or Docker access.

## Authority and workflow
1. Revalidate the live `main` commit, upstream pinned SHA, open PRs, CI, GHCR image and actual Portainer deployment before operating.
2. Read this file, `AGENTS.md`, `docs/CANONICAL_STATE.md`, relevant documentation upstream and `deploy/README.md`; distinguish plan from proved runtime.
3. Upstream sources are vendored once from a pinned commit, with MIT LICENSE and notices preserved. Track origin in `UPSTREAM.md`; upgrade only by reviewed PR, **never silently**.
4. Run tests/build in GitHub Actions and publish a digest-addressable GHCR image **only after checks pass**. The 28server pulls the immutable, tested image. No `build:` in Portainer Stack.
5. Do not deploy a second instance, change TLS settings, delete prior volumes, clean Docker globally or alter unrelated services. Inventory legacy resources first; retain rollback until healthy replacement.
6. Protect all secrets. Never put Chutes keys, Portainer tokens, BasicAuth passwords/hashes, login launch tokens, cookies or client data in GitHub, CI logs, memory or chat.
7. Separate Harness/Web UI, future MCP integration, and privileged infrastructure operations. Any write-capable external action must be explicitly approved and narrowly authorized.

## Current state
- Current verified operational checkpoint is maintained in `docs/CANONICAL_STATE.md` (2026-10-15 UTC). Existing DSH is running on 28server; owner separately authorized identity on wandora-vps-01. MCP activation remains pending. The original bootstrap observations below are historical, not current runtime status.

## Historical initial observations — 2026-10-12
- 2026-10-12: repository initially verified empty/public and writable.
- Prior standalone Docker deployment on 28server exists but repeatedly failed startup (`No usable prebuilt binary found in linux-x64-gnu`); fixes were staged but not proven.
- HTTPS origin was serving Traefik's default certificate; Cloudflare returned HTTP 526.
- **No successful Stack deployment, green GHCR release, Chutes credential or ChatGPT plugin has been verified.**
