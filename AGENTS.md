# DeepHarness contributor rules

1. Read `docs/PROJECT_SOURCE.md`, `docs/CANONICAL_STATE.md`, `UPSTREAM.md`, and `deploy/README.md` first. For changes inside vendored upstream packages, also follow the upstream `docs/AGENTS.md` and relevant docs.
2. Only target VPS: `28server`. No production changes from speculative troubleshooting.
3. Do not overwrite vendored upstream updates automatically; propose diffs/PR with checks. Preserve LICENSE and third-party notices.
4. Keep reusable code separate from deployment overlay under `deploy/` and an eventual `integrations/chatgpt-mcp/`.
5. GHCR image may be released only after native addon probe, Docker build and bootstrap smoke checks. Keep digest and rollback instructions.
6. No hardcoded or committed tokens, passwords, hashes, sessions, cookies, Portainer endpoints or customer data.
7. Do not remove legacy Docker volumes or containers without inventory, provenance and explicit approval. No `docker system prune`, no changes to Traefik shared settings or other applications.
8. Distinguish verified facts, in-progress checks, assumptions and future integration.
