# Stage C — Owner backend TLS certificate/key correspondence (2026-10-16)

The owner executed a read-only comparison of the SHA-256 fingerprints of DER-encoded public keys derived separately from backend-server-chain.pem and backend-server-key.pem on 28server, reporting only `MCP_CERT_KEY_MATCH`.

**Verified:** the public key derived from the existing backend private key matches the public key of the first certificate in the existing backend certificate PEM, assuming both OpenSSL extraction operations succeeded. The command as written suppressed private-key parse diagnostics and did not explicitly check pipeline exit codes, so this is owner evidence for match, not complete cryptographic mTLS readiness. No certificate, private key, digest or token was sent to chat.

**Remaining:** independent client certificate presentation, backend server identity validation, full mTLS handshake against intended disabled/internal listener, Portainer minimal configuration recovery, runtime activation and expressly authorized single-stack cutover. Never activate public ingress or use live volumes in an alternative Web process for these tests. Cutover remains NO-GO.
