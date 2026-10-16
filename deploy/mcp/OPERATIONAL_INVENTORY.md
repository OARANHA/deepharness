# MCP operational inventory — 2026-10-14

Verified through MCP, read-only, on target medicspro-managed-admin:
- Hostname: 28server. Identity server wandora-vps-01 is separate.
- Existing DSH: deepharness-web-1, running, restart count 0, user node, root filesystem read-only.
- Configured image: ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075.
- Mounted volumes: deepharness_dsh_data at /data/dsh; deepharness_dsh_workspace at /workspace. Preserve both.
- DSH network: traefik-public, observed address 172.19.0.12. Port3080 not published to host.
- Traefik: container traefik, image traefik:v3.6, running, restart count0; same network observed172.19.0.3; host443/80 mapped. Do not copy identity-server file-provider configuration to this host.
- Installed distribution descriptor: @deepseek-ai/dsh 0.2.1-alpha.2, bin lib/bin.js, export ./profile-boot to ./lib/profile-boot.js.
- The version-tagged official source exports runProfile(options) returning {ctx,shutdown}; CLI supplies loadLayeredEnv('dsh'), profile, patchFiles, args. See upstream tag dsh-v0.2.1-alpha.2 apps/cli/src/{bin,profile-boot}.ts.
- The package descriptor was inspected in production; exports of the built profile-boot module have not yet been exercised. A wrapper must be verified against the packaged distribution before deployment.

## Composition to implement
Start the existing Web profile once through its official launcher, then mount the read connector on the returned existing Cordis context. Do not instantiate another Context, workspace registry or SessionStore, and do not copy session files to a sidecar. Supply trusted PostgreSQL grant/revocation query, pinned discovery, SDK/schema and backend TLS through operator-owned composition. Close listener/transport/pool through the same context lifecycle and fail closed on replacement. Preserve profile configuration and Web arguments. Build a derived tested image, not installation into the running container.

## Dedicated ingress prerequisite
Proposed resource: https://dsh-mcp.wandora.com.br/mcp.
This name is a proposal, not verified DNS or an active endpoint.
The prepared Envoy external-mTLS design requires the OpenAI certificate to reach Envoy. It therefore requires DNS-only (gray cloud), plus TCP/SNI pass-through at the existing ingress or another explicitly reviewed transport. No TCP router, certificate, firewall, listener or DNS change has been applied.
Identity remains https://id.wandora.com.br/realms/deepharness; its Cloudflare orange proxy is independent.

Still pending: verify built launcher behavior; reviewed operational wrapper and image; primary grants database; backend/public certificates and OpenAI CA; exact callback from real ChatGPT UI; disabled OAuth clients and separate realm user; exact workspace/Lead canary grant; backup/restore; approved cutover and real ChatGPT canary. This inventory is not evidence of a connected ChatGPT client.

## DNS and existing-profile preparation — 2026-10-14
Owner created A dsh-mcp.wandora.com.br -> 158.220.97.145, DNS-only. An unprivileged Node DNS query through medicspro-agent on28server independently returned exactly that IPv4.

Added existing-profile-host.mjs: calls trusted official runProfile once for Web, passes existing arguments/patch layers, checks original workspace/session/projection identities, provides policy and mounts the installed read plugin on that returned context. It creates no Context, sessions or MCP listener. Five local lifecycle tests passed. Candidate Dockerfile/CI now run verify-existing-mcp-profile.mjs after the existing offline official installer; it is intended to verify real packaged launcher, Web401, installed service, denied ungranted read and root disposal. New real-container result is PENDING; do not infer success from local tests. No production image release/redeploy, private listener, client/grant or certificate was applied.
