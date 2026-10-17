# REVIEW ONLY: ChatGPT MCP public HTTPS bridge (28server)

This draft does **not** deploy, merge, restart or change credentials. The owner approved preparing
the ingress deployment and guiding a later, separately confirmed same-stack Portainer redeploy.
The owner chose the existing ChatGPT **server URL / OAuth** route, not a Secure MCP Tunnel,
and explicitly waived backups/restore rehearsals as mandatory gates for this disposable lab.
Waiving backups never waives mTLS, TLS verification, per-user OAuth/grants, or data-volume safety.

## Evidence / original blockage (2026-10-17)

- `dsh-mcp.wandora.com.br` resolves to the actual 28server public address, and Traefik binds 80/443.
- SNI probe for the MCP host got `CN=TRAEFIK DEFAULT CERT`, metadata GET returned HTTP 404.
- The original Stage C stack disabled the `mcp-proxy` using a Compose profile and
  `traefik.enable=false`. Owner verified there is no proxy container nor operator `envoy.json`.
- Web lab.4 is running with a private mTLS listener at 3443; PostgreSQL reader uses 1500ms,
  so Stage D lab.5 strict 750ms authority gate is still RED until a separate reviewed migration.
- The **production Portainer API exposed to this assistant did not resolve stack ID 90**;
  repository `main` is *not* proof of the live stack's effective Git ref. Owner must use
  the actual 28server Portainer UI and compare its **current** stack file before approval.

## Reviewed architecture

```text
ChatGPT MCP client  -> HTTPS :443 / valid public certificate at existing Traefik
                      -> HTTP :8080 inside existing Docker traefik-public network only
                      -> Envoy (exact Host + exact two MCP paths)
                      -> HTTPS mTLS / dedicated client certificate + CA + SAN validation
                      -> deepharness-mcp-backend:3443 on internal mcp-private network
                      -> existing DeepHarness OAuth JWT sub/scope/role grants/read-only checks
```

The Traefik-to-Envoy hop is HTTP **inside the shared Docker network**, not encrypted
end-to-end. This is a deliberate security/trust-boundary tradeoff to reuse the existing
Traefik ACME resolver instead of provisioning/rotating a separate public certificate in
Envoy. Do not represent it as external plaintext, or as end-to-end TLS. It must not have
a Docker host port; the proxy receives only Docker-network traffic from Traefik and
remains a non-root, read-only-rootfs, cap-drop service. If this Docker trust boundary is
unacceptable, STOP and review a separately protected Traefik-to-Envoy link.

Envoy config: `deploy/mcp/envoy-public-bridge.review.yaml`.
Operator-owned runtime bind remains
`/opt/wandora/data/deepharness-mcp/review/envoy.json` (create only after
deployment approval, from the **frozen reviewed file**).
Public route is HTTP router + ACME with `Host(dsh-mcp.wandora.com.br)`, no TCP
passthrough and no BasicAuth on MCP (the backend still requires OAuth and explicit grants).

## Fail-closed operator inputs BEFORE any Portainer redeploy

**Stage C certificate reuse correction (2026-10-17):** Prior work already prepared
an Envoy client mTLS certificate; this PR reuses it. The earlier suggestion to
issue a new certificate was unnecessary and is superseded. The only current
certificate requirement is a fresh, non-secret read-only presence/trust check.

1. Verify that the currently running Portainer `deepharness` stack, original Web image,
   named volumes and credentials map to the reviewed Compose source. **Do not create a second stack**.
   Keep the source and original image reference recoverable privately.
2. Confirm Traefik's existing `websecure` entrypoint and `letsencrypt` certresolver
   actually work for a new hostname. DNS points to 28server, but that alone does not
   prove certificate issuance. Never disable public TLS verification.
3. Owner verified the locally cached Envoy v1.39.0 immutable digest:
   `envoyproxy/envoy@sha256:d59f7f5fa10cff6d5892b6c5e7df5c9297ddfb2c3683e33fbfb82da24de4fa66`.
   Use this exact reviewed reference for `DSH_MCP_PROXY_IMAGE`; do not use a mutable tag.
4. Owner verified live backend server certificate SAN **DNS:deepharness-mcp-backend**,
   exactly matching the reviewed Envoy backend TLS validation. Reconfirm if rotated.
5. **REUSE the existing Stage C certificate pair**; do NOT generate another client certificate:
   `/opt/wandora/data/deepharness-mcp/tls/proxy/proxy-backend-client-chain.pem` and
   `/opt/wandora/data/deepharness-mcp/tls/proxy/proxy-backend-client-key.pem`.
   Earlier operator records reported `MCP_MTLS_MUTUAL_AUTH_GREEN`, confirming the
   prepared client was accepted by the backend in Stage C. This historical check is
   not proof those files still exist or are readable today. Before deployment,
   owner must verify the **live** pair is present, matches, verifies against
   `tls/backend/backend-ca.pem`, and can be read by container UID 1000. The existing
   backend CA remains mounted independently; never print or commit private keys.
   Do not alter key ownership/permissions broadly to force a PASS.
6. Verify `/opt/wandora/data/deepharness-mcp/review/envoy.json` is populated from
   exactly this reviewed file (currently **absent**), owned appropriately for UID 1000;
   ensure no symlinks that escape reviewed directories. Do not edit runtime DSH credentials.
7. Validate actual Envoy config with the selected immutable image using
   `envoy --mode validate` and synthetic/test credentials before enabling the route.
   The draft CI job validates only schema/structure with disposable test certs.
8. Explicitly inspect the final same-stack Portainer diff: only new Envoy ingress,
   no changed Web/DB images, commands, mounts, users, grants, Keycloak, model settings,
   private data volumes or published host ports. **Obtain a separate deployment approval**.

## Authorized later cutover (not performed by this PR)

- Copy only the reviewed Envoy config to the operator-owned bind path, reuse and
  verify the existing Stage C proxy mTLS certificate pair, and pin the verified Envoy digest.
- Apply the exact reviewed Compose update to the existing Git-backed Portainer stack
  after confirming its live ref; one owner-approved Pull/redeploy of the *same* stack.
- Require Traefik present a publicly trusted cert for `dsh-mcp.wandora.com.br`.
  With **no Bearer tokens**, an unauthenticated probe should reach the intended
  backend's OAuth challenge or MCP protected-resource discovery, never return a
  Traefik 404/default cert, and never return any protected Agent Teams data.
  A backend 403 can still reveal missing Origin/header compatibility; do NOT
  forge JWT, silently inject identity headers, disable checks or mask it as success.
- **Only then** finish the separately approved lab.5 strict-read-profile 750ms
  migration and exact bundle upgrade in the existing Web. Current lab.4 listener
  being alive is not proof lab.5 works in production.
- Finally validate Keycloak `dsh-chatgpt-human` with ChatGPT callback/PKCE,
  individual `sub` grant and live `dsh_read_agent_team` read and negative cases.
  No privileged tools/delegation yet.

## Abort / rollback boundary

Stop on invalid cert/SAN, absent client key, failed config validation, default TLS
cert, route 404, public exposure outside the two exact paths, identity/grant denial
regressions, or unrelated Web/DB changes. Revert **only the proxy service/route** to its
reviewed disabled state within the same stack, retaining Web/DB versions and volumes.
Do not `docker compose up` directly outside Portainer, delete or recreate volumes,
re-publish port 3443, disable signature verification, or add an auth bypass.
