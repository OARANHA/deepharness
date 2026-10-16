# Stage C — operator runtime activation contract (NO-GO until separately approved)

Verified source review: 2026-10-16. Scope: future **private** cutover of the existing 28server Portainer stack 90 only. This document is NOT a deploy instruction or approval.

## Frozen runtime schema

The implementation `deploy/mcp/operational-host.mjs` enforces an **exact** six-field object (no extra keys):

| Field | Required value |
| --- | --- |
| `version` | `1` |
| `enabled` | `true`, but ONLY within an approved cutover window |
| `issuer` | `https://id.wandora.com.br/realms/deepharness` |
| `resource` | `https://dsh-mcp.wandora.com.br/mcp` |
| `backendPort` | `3443` |
| `allowedOrigins` | ordered `["https://chatgpt.com","https://chatgpt-mtls-proxy.invalid"]` |

`runtime.review.json` stays `enabled:false` in Git. The internal `.invalid` sentinel is NOT permission for a public origin. No passwords, tokens, certificates, secret paths or grants are embedded in the JSON. The operational launcher intentionally fails closed if the JSON is disabled, mismatched, malformed or has extra keys.

## Host target and confirmed evidence

- Proposed host mount: `${DSH_MCP_REVIEW_ROOT}/runtime.json` → `/etc/wandora-mcp/runtime.json`, read-only. Proposed review root previously used in dummy-only Compose is `/opt/wandora/data/deepharness-mcp/review`; owner `namei` readback found it **absent**. Do not assume this directory exists now or create it without approval.
- Web runs as UID:GID `1000:1000`; grants primary runs `999:999`. Owner-approved five-file Docker bind mount canary passed without reading secret bytes. This does not test the future runtime file mount.
- Web boot requires unique `deepharness-web-edge` and `deepharness-mcp-backend` IPv4 addresses on separate networks; reads a 64-hex-character DB reader password and verifies a single primary PostgreSQL role with SELECT but no write grants; performs pinned Keycloak discovery; boots existing official DSH profile at port 3080; and only then starts private mTLS backend at 3443. Any failure must stop the candidate; no public Envoy route.
- Review Compose defines `mcp-proxy` behind profile `mcp-review-only` with `traefik.enable:false`; production ingress stays OFF.

## Required owner readbacks BEFORE enabling anything

1. Reconfirm Portainer 28server stack **90** and saved original Compose, original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`, named DSH data/workspace volumes, working Web/Agent Teams and current BasicAuth route.
2. Verify the intended review root **parent metadata** and an operator-reviewed plan to create the runtime directory/file with permissions enabling UID 1000 read, without broadening existing root-only secret directories. Do not reuse production secret directories for world-readable files.
3. Establish **actual staged file** ownership/mode, exact read-only mount and JSON schema validation **without printing any file content**. No active `enabled:true` runtime exists at this gate.
4. Verify correct Portainer variable names `DEEPHARNESS_IMAGE` and `DSH_BASIC_AUTH_USERS` owner-reported present in existing stack 90, and required Stage C variables `DSH_MCP_HOST_IMAGE`, `DSH_MCP_GRANTS_IMAGE`, `DSH_MCP_PROXY_IMAGE`, `DSH_MCP_REVIEW_ROOT`, `DSH_MCP_SECRET_ROOT` (new; NOT required in the existing stack).
5. Produce a final redacted effective Stage C Compose on a frozen reviewed commit, with image digests, all binds, UID, internal network and no proxy. A **dummy-only** `docker compose config` gate is GREEN but doesn't establish actual Portainer env values or mounted runtime existence.
6. Freeze exact original Web rollback commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4` and the safe branch `safety/deepharness-web-original-20261016`. These preserve the original **Compose source**, not Portainer secrets or volume snapshots. Actual deployed commit remains unproven.
7. Request separate explicit **first owner authorization** specifying maintenance window, exact candidate commit, verified rollback reference, and changes to stack 90. Without it **NO-GO**.

## Separate public authorization (never implicit)

MCP proxy/public SNI, Keycloak client activation, real named owner-to-workspace/Lead grants, and a single real ChatGPT read canary require a **second separate approval** after Stage C private Web/Agent Teams continuity is demonstrated.

**Forbidden at this stage:** create/write active runtime; touch `stack.env` or `portainer.db`; expose hashes/keys; chmod existing production dirs; restart the Web; merge the PR; pull/redeploy stack 90; launch a second DSH Web using production volumes; create real permissions; activate ingress.

Result: source contract documented, production cutover remains **NO-GO**.
