# Stage C — owner TLS certificate expiry evidence — 2026-10-16

Owner executed `openssl x509 -in <cert-file> -noout -checkend 86400` from `root@28server` for two certificate files. The reported results:

- `CERTIFICADO OK` for `/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem`
- `CERTIFICADO OK` for `/opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem`

**Interpretation:** Each file was parsed as an X.509 certificate and its first certificate was not due to expire within the next 24 hours at test time. **This does not establish** validity of every PEM chain member, CA trust constraints, correct TLS peer identity, key/certificate matching, complete mutual-TLS handshake, or health at a future maintenance window. No certificate or key bytes were shared.

**Status:** limited expiry gate GREEN. Full cryptographic chain/mTLS gate and same-stack Portainer rollback readiness still pending. Private production cutover remains **NO-GO**, and public OAuth/ingress requires separate approval.
