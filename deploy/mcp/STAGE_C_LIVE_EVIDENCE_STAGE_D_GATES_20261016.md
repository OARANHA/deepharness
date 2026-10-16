# DeepHarness Stage C — live private cutover evidence (2026-10-16)

> Operator-confirmed outputs from `root@28server` and browser, **not an independent remote inspection**. This document supersedes older "not deployed" wording for this one slice; other historical statements require separate reconciliation.

## Confirmed production scope

- Existing **Portainer stack 90**: owner reports Pull and redeploy completed after merge of PR #6 to `main` (merge commit `c71c791d7e33084c67198643200764069c1c2668`, compose blob `b8e96a0948a823d4eec23aa1ae33e12a60a0c462`).
- `deepharness-web-1`: image `sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`, running, restart count zero at operator readback.
- `deepharness-mcp-grants-db-1`: running and healthy at operator readback, immutable image prefix `6279a36d7cd9`.
- The Web continues to mount `deepharness_dsh_data:/data/dsh` and `deepharness_dsh_workspace:/workspace`. Owner confirmed Web login and history/Agent Teams GREEN after recovering original BasicAuth and opening DSH launch URL privately.
- Public `mcp-proxy` container **not running**; private stage only.
- Backend internal listener `deepharness-mcp-backend:3443` connected on isolated network, not localhost.
- Negative mTLS test: client **without** certificate attempted HTTP request and observed `MCP_MTLS_NO_CERT_REJECTED`. Positive mTLS test: client with operator-provisioned certificate and trusted CA received HTTP response: `MCP_MTLS_MUTUAL_AUTH_GREEN`. Server CA/name check `MCP_SERVER_CERT_CA_GREEN`. **An HTTP response on /health is proof of accepted TLS client identity, not proof of OAuth authorization or Agent Teams read.**
- Original Compose rollback verified locally with Git blob `cd72a46a2e458fcc6902d3ca243ac31c2979d346`; owner-held file `/root/deepharness-rollback/portainer-stack.original.yml`; original GHCR digest `sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`; existing recovery Git branch `safety/deepharness-web-original-20261016`. Do not claim rollback has been exercised after cutover.
- BasicAuth was initially truncated by variable restore (original length 66, current 37), then owner confirmed Web GREEN after recovery. Never store or print hash, token, user credentials, or authenticated launch link.

## Stage D — pending / not authorized or tested

1. Reconcile OAuth issuer/discovery, Keycloak client type and allowed callback/redirect URIs, token `sub` individual identity, `aud`/`iss`/`nbf`/PKCE; preserve strict validation. Do not copy human browser cookies, access tokens or sessions.
2. Reconcile read-only grant schema, explicit actor-to-Agent Team authorization, default deny, negative authorization tests, no arbitrary execution/write calls.
3. Review trusted public proxy pathway including distinct client/server TLS identity, origin restrictions, Traefik routing, host firewall, and exposure boundary. The **current operational proxy is disabled**; enabling any public listener requires a **separate owner authorization** and fresh tested deployment plan.
4. Verify exact read-only MCP transport and ChatGPT connection with valid OAuth and granted principal only after stages 1-3; separately test denial for ungranted principal and expired/invalid tokens.
5. Preserve existing Web, mounts, Agent Teams and rollback references; avoid a second Web process against live volumes; no destructive operations.

## Next safe engineering slice

Prepare a Stage D **review-only** PR with a concrete authority matrix, OAuth/mTLS boundaries, Keycloak client configuration requirements, read-only grants test contract and rollback/no-go conditions. Do not modify `deploy/portainer-stack.yml` or turn on `mcp-proxy` until separately approved.
