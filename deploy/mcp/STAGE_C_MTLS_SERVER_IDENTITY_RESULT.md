# Stage C — owner mTLS certificate identity checks (2026-10-16)

Owner provided independent outputs from read-only OpenSSL X.509 inspection on 28server:
- `MCP_CA_CONSTRAINT_OK` — the backend CA certificate's text includes `CA:TRUE` within Basic Constraints.
- `MCP_SERVER_SAN_EXPECTED` — the server certificate's text includes `DNS:deepharness-mcp-backend`.

These text-grep checks are limited evidence: they do not themselves prove SNI/hostname validation by an actual client, Extended Key Usage, chain presentation, client certificate validity, client identity mapping, or a live mTLS handshake. Backend certificate expiration, chain verify, and public/private key correspondence were separately reported by owner earlier.

**Current decision:** local server identity checks GREEN; client authentication and end-to-end mTLS still unverified. Private single-stack cutover remains NO-GO; original Web and Portainer stack 90 unchanged.
