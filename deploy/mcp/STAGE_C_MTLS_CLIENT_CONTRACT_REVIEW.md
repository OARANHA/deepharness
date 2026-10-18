# Stage C — source-reviewed client-side mTLS contract (2026-10-16)

## Proven from existing implementation

- `deploy/mcp/private-read-listener.mjs` creates a Node HTTPS server with `requestCert:true`, `rejectUnauthorized:true`, `minVersion:'TLSv1.2'` and an explicitly bound IPv4 address. This is an implementation-level requirement to reject clients without a trusted cert, **not proof of successful live handshake**.
- `deploy/mcp/operational-host.mjs` reads only `/run/secrets/backend-server-key.pem`, `/run/secrets/backend-server-chain.pem` and `/run/secrets/backend-ca.pem` for the backend TLS server and binds backend service at `deepharness-mcp-backend:3443`. The backend is not the issuer of a client identity.
- `deploy/mcp/portainer-stack.review.yml` attaches the future `mcp-proxy` to a separately specified `${DSH_MCP_SECRET_ROOT}` at `/run/secrets` and attaches to the internal `mcp-private` network; the proxy is disabled by profile and Traefik label. The exact client certificate/key/CA names and Envoy SDS/static secret configuration must be sourced from the **actual pinned proxy configuration generator**, not guessed.

## Next evidence gate

1. Read the implementation of the generator that creates `envoy.json`, the exact client certificate/key reference, the trust root and SNI `deepharness-mcp-backend`. Never copy private PEM contents into Git/chat.
2. Verify declared paths match the future secret mount; check client's certificate EKU, validity, CA chain, public-key/private-key match via non-disclosing owner script (after path verified from source).
3. Add or confirm isolated CI tests for: valid pinned client accepted, absent client rejected, untrusted client rejected, mismatched server hostname rejected. Do not reuse production credentials in test fixtures.
4. Only after explicit single-stack deployment authorization can the real private listener/handshake be tested; do not activate it for this preflight.

**Current decision:** server-side implementation enforces client TLS in source; operational client identity and actual mTLS handshake remain pending. NO-GO for production change.
