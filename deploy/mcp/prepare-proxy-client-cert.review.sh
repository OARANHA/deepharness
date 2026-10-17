#!/usr/bin/env bash
# REVIEW ONLY. Default --check reads status. --issue writes ONLY with explicit owner approval.
# No private key or secret output. Never commit generated material.
set -euo pipefail
umask 077
deny() { echo MCP_PROXY_CERT_DENIED; exit 1; }
[[ "$#" == 1 ]] || deny
mode="$1"
[[ "$mode" == --check || "$mode" == --issue ]] || deny
root=/opt/wandora/data/deepharness-mcp/tls
ca="$root/backend/backend-ca.pem"
key="$root/proxy-client-key.pem"
cert="$root/proxy-client-cert.pem"
[[ -d "$root" && ! -L "$root" && -f "$ca" && ! -L "$ca" ]] || deny
openssl x509 -in "$ca" -noout >/dev/null 2>&1 || deny

check_pair() {
  [[ -f "$cert" && ! -L "$cert" && -f "$key" && ! -L "$key" ]] || deny
  openssl x509 -in "$cert" -noout -checkend 86400 >/dev/null 2>&1 || deny
  openssl verify -purpose sslclient -CAfile "$ca" "$cert" >/dev/null 2>&1 || deny
  cmp -s <(openssl pkey -in "$key" -pubout -outform DER 2>/dev/null) <(openssl x509 -in "$cert" -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null) || deny
  openssl x509 -in "$cert" -noout -text | grep -F 'TLS Web Client Authentication' >/dev/null || deny
  [[ "$(stat -c '%u:%g:%a' "$key")" == "1000:1000:400" ]] || deny
  [[ "$(stat -c '%u:%g:%a' "$cert")" == "1000:1000:444" ]] || deny
}
if [[ "$mode" == --check ]]; then
  if [[ -e "$cert" || -L "$cert" || -e "$key" || -L "$key" ]]; then
    check_pair
    echo MCP_PROXY_CLIENT_CERT_PRESENT_VALID=true
  else
    echo MCP_PROXY_CLIENT_CERT_PRESENT_VALID=false
  fi
  echo MCP_PROXY_CLIENT_CERT_PREFLIGHT=GREEN
  exit 0
fi

[[ "$(id -u)" == 0 ]] || deny
[[ "$(hostname -s)" == 28server || "${MCP_PROXY_CI_FIXTURE:-}" == ephemeral-github-runner-only ]] || deny
[[ "${MCP_PROXY_CERT_ISSUE_ACK:-}" == APPROVE_NEW_PROXY_CLIENT_CERT_ONLY ]] || deny
[[ ! -e "$cert" && ! -L "$cert" && ! -e "$key" && ! -L "$key" ]] || deny
issuer="${MCP_PROXY_CA_SIGNING_KEY:-}"
[[ -n "$issuer" && -f "$issuer" && ! -L "$issuer" ]] || deny
cmp -s <(openssl pkey -in "$issuer" -pubout -outform DER 2>/dev/null) <(openssl x509 -in "$ca" -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null) || deny
openssl x509 -in "$ca" -noout -text | grep -F 'CA:TRUE' >/dev/null || deny
openssl x509 -in "$ca" -noout -checkend 2678400 >/dev/null 2>&1 || deny

temp=''
cleanup() { [[ -z "$temp" ]] || rm -rf -- "$temp"; }
trap cleanup EXIT
temp="$(mktemp -d "$root/.proxy-client.pending.XXXXXXXX")" || deny
cat >"$temp/client-ext.cnf" <<'EOF'
[v3_client]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
subjectAltName=DNS:deepharness-mcp-proxy
EOF
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$temp/client-key.pem" >/dev/null 2>&1 || deny
openssl req -new -key "$temp/client-key.pem" -subj '/CN=deepharness-mcp-proxy' -out "$temp/client.csr" >/dev/null 2>&1 || deny
serial="0x$(openssl rand -hex 16)"
openssl x509 -req -in "$temp/client.csr" -CA "$ca" -CAkey "$issuer" -days 30 -sha256 -set_serial "$serial" -extfile "$temp/client-ext.cnf" -extensions v3_client -out "$temp/client-cert.pem" >/dev/null 2>&1 || deny
openssl verify -purpose sslclient -CAfile "$ca" "$temp/client-cert.pem" >/dev/null 2>&1 || deny
[[ ! -e "$cert" && ! -L "$cert" && ! -e "$key" && ! -L "$key" ]] || deny
install -o 1000 -g 1000 -m 0400 "$temp/client-key.pem" "$key" || deny
install -o 1000 -g 1000 -m 0444 "$temp/client-cert.pem" "$cert" || deny
check_pair
echo MCP_PROXY_CLIENT_MTLS_CERT_ISSUED_AND_VERIFIED
