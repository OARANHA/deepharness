# Stage C — private file metadata gate (READ ONLY)

The Compose candidate `deploy/mcp/portainer-stack.stage-c.review.yml` requires five exact preexisting host files:

| Purpose | Host path | Container path |
| --- | --- | --- |
| mTLS server key | `/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-key.pem` | `/run/secrets/backend-server-key.pem` |
| mTLS server certificate | `/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem` | `/run/secrets/backend-server-chain.pem` |
| mTLS CA | `/opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem` | `/run/secrets/backend-ca.pem` |
| DB admin password | `/opt/wandora/data/deepharness-mcp/secrets/admin-db-password` | Compose secret |
| DB runtime password | `/opt/wandora/data/deepharness-mcp/secrets/runtime-db-password` | Compose secret |

### Actual unprivileged readback, 2026-10-16

The allowlisted `medicspro-managed-admin` execution target attempted `os.stat` **only** against all five paths, and returned **errno 13 (EACCES)** for each. This provides no evidence of presence/absence, content or validity; it only proves access to path metadata is denied to this target. **Do not loosen privileges, change modes or reveal secrets to fix a metadata inspection.**

### One-time owner root metadata probe

The owner may execute this on the correct `root@28server` terminal. It prints only path names, regular-file status, numeric owner UID/GID and mode; never reads secret bytes, prints certificates, opens config, or changes permissions.

```bash
python3 - <<'PY'
import os,stat
files=[
'/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-key.pem',
'/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem',
'/opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem',
'/opt/wandora/data/deepharness-mcp/secrets/admin-db-password',
'/opt/wandora/data/deepharness-mcp/secrets/runtime-db-password',
]
for path in files:
    try:
        item=os.stat(path)
        status='REGULAR' if stat.S_ISREG(item.st_mode) else 'NOT_REGULAR'
        print(f'{os.path.basename(path)}: {status} mode={stat.S_IMODE(item.st_mode):04o} uid={item.st_uid} gid={item.st_gid}')
    except OSError as error:
        print(f'{os.path.basename(path)}: ERROR errno={error.errno}')
PY
```

Confirm container-user readability via an **isolated, non-production metadata-only check** before production startup; note `web` image default UID and `mcp-grants-db` configured user `999:999`. Neither the presence of a file nor host-root access proves that the non-root container process can read it. For key/certificate validity, compare public fingerprints and verification outcomes only—never paste private key or database password contents.

The operational runtime source `deploy/mcp/runtime.review.json` remains `enabled:false`; no live enabled runtime exists under this review artifact. The actual candidate is still NO-GO until the owner explicitly approves its private-only cutover, and the effective Portainer environment, image references, read access, existing volumes and rollback reference are verified.
