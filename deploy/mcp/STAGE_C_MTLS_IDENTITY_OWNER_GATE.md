# Stage C — isolated mTLS readiness gate, no production listener (2026-10-16)

**Scope:** preflight only; the private MCP endpoint is not enabled. The checks below do not initiate a TLS handshake, run Docker, change a file, activate a listener or reveal credentials. Production stack 90 stays unchanged.

## Already evidenced by owner

- Backend server first certificate and CA certificate pass OpenSSL expiry >24h.
- OpenSSL verifies backend server certificate with the selected backend CA: OK.
- Owner reports backend server certificate-public-key and private-key-public-key match.
- This is not proof of client identity, SAN correctness or a real mTLS handshake.

## Next bounded owner test — public certificate identity and client cert existence

On `root@28server`, run the following **read-only** script. It prints ONLY normalized pass/fail labels, not paths containing user identities, subject/SAN values, certificate bodies, hashes, keys or tokens:

```bash
D=/opt/wandora/data/deepharness-mcp/tls/backend
if openssl x509 -in "$D/backend-server-chain.pem" -noout -text 2>/dev/null | grep -q 'DNS:deepharness-mcp-backend'; then
  echo MCP_SERVER_SAN_EXPECTED
else
  echo MCP_SERVER_SAN_NEEDS_REVIEW
fi
if openssl x509 -in "$D/backend-ca.pem" -noout -text 2>/dev/null | grep -A4 'X509v3 Basic Constraints' | grep -q 'CA:TRUE'; then
  echo MCP_CA_CONSTRAINT_OK
else
  echo MCP_CA_CONSTRAINT_REVIEW
fi
```

**Caution:** The intended DNS identity must be checked against the effective backend service name/expected SNI in the proposed Compose and client. If implementation expects a different host, do not change certificates blindly; diagnose mismatch. A failed text grep is *not* conclusive evidence of certificate invalidity.

## Then, not yet done

1. Inspect pinned mTLS client certificate/key paths and trust roots declared by the actual launcher/schema, without displaying secret contents or guessing filenames.
2. In disposable isolated CI, test both directions of trust plus rejecting an untrusted client. No access to live DSH volumes and no public ingress.
3. On the eventually approved private deployment, require controlled loopback/private handshake with certificate identity, client auth, expected failures and no externally published MCP listener.
4. Verify root recovery of Portainer env values privately; complete exact deploy-path Compose diff; obtain explicit owner approval.

**Decision:** preparatory checks only; production cutover NO-GO.
