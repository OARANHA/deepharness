# Stage C — live operational evidence gate (owner read-only)

**CI GREEN:** commit `ff6fae603a1352c36d6ee5c1f3305e573b2d5f99`, workflow runs `38935306830` (Stage C) and `38935306963` (bootstrap), both completed successfully.

**Decision: NO-GO** until the following independent production evidence is obtained. Do not execute a second DSH Web against existing volumes; do not activate runtime or modify Portainer stack 90.

## Gate A — Agent Teams continuity

Owner should confirm normal authenticated access to `https://deep.wandora.com.br` under existing BasicAuth and verify an existing Lead/session and Agent Teams listing using the **existing** UI. Record a non-secret PASS/FAIL marker and the expected pre-cutover state; do not disclose session tokens, cookies, messages or team content. Docker `WEB_STATE=running` does **not** establish continuity of app functions.

## Gate B — TLS validity

On 28server authorized root, inspect **only certificate files** for validity dates and public certificate metadata, not private key contents:

```bash
for f in /opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem /opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem; do
  if openssl x509 -in "$f" -noout -checkend 86400 >/dev/null 2>&1; then
    printf 'CERT_VALID_MORE_THAN_24H %s\n' "$f"
  else
    printf 'CERT_INVALID_OR_EXPIRES_WITHIN_24H %s\n' "$f"
  fi
done
```

The check does not establish correct peer identity, trust chain, key matching, server behavior or expiry for future maintenance dates. A later explicitly approved pre-cutover gate must verify the complete internal mTLS chain without exposing secrets.

## Gate C — rollback recoverability

Existing source anchor `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`; immutable original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`; original volume names `deepharness_dsh_data` and `deepharness_dsh_workspace`. Previous owner preflight shows image present, volumes present, running original Web, zero restarts. GitHub CI exercised disposable restore, **not real Portainer rollback**.

Owner must separately verify Portainer stack 90 source/ref, safe backup of stack configuration/environment without exposing values, volume attachment mapping and a non-destructive rollback plan. **Do not test actual rollback against the live Web without the first explicit cutover approval.**

## Approval threshold

Proceed to seek owner approval only after Agent Teams continuity is observed, cert precheck is GREEN (and full TLS validation is planned), the effective Compose is reviewed, Portainer rollback metadata is confirmed and the operator/runtime setup is ready. Otherwise remain NO-GO. Public proxy/OAuth/real grants/ChatGPT connection are separate, later approval.
