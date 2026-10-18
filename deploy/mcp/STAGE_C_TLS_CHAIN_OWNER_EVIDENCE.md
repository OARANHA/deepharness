# Stage C — owner certificate chain check (2026-10-16)

Owner ran OpenSSL `verify -CAfile /opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem /opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem` on 28server. Reported output: `/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem: OK`.

**Verified in this limited invocation:** OpenSSL accepted the certificate file under the supplied local CA. This is not proof of the complete presented intermediate chain, client-certificate authorization, peer hostname validation or a live mTLS handshake. Certificate/private-key pair match also pending. No private key or token shared.

**Decision:** chain check GREEN, operational mTLS gate remains incomplete, private cutover NO-GO.
