## Owner-approved real Docker bind mount access canary — GREEN 5/5 (2026-10-16)

Owner explicitly authorized `APROVO TESTE DE MOUNTS` and executed five ephemeral `docker run --rm` inspections on `root@28server` against the pre-existing immutable MCP host image. Each used `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 32`, one host bind file `readonly`, a named numeric `--user`, and a Node probe performing only `openSync`+`fstatSync`+`closeSync` (no secret bytes printed/read). Returned **MOUNT_ACCESS_GREEN** for backend key (1000:1000), backend chain (1000:1000), backend CA (1000:1000), DB admin password (999:999), DB runtime password (1000:1000). **5/5 GREEN**. This directly resolves bind-mount file open/read permission uncertainty under the inspected image/user fixture even though protected host ancestor directories are root-only.

Limitations: No actual Stage C Web launched, no certificate chain/expiration or DB credential value verified, no enabled runtime produced, and no live Portainer stack, DSH volume, listener or OAuth touched. Any later CI result must be independently checked for its exact commit. **Private cutover remains NO-GO** pending owner runtime/config review and explicit deployment approval.

## Owner root metadata readback — 2026-10-16 (CONFIRMED)

The owner executed the metadata-only root probe on 28server. All five paths are **regular files**, with these numeric attributes:

| File | Mode | UID | GID |
| --- | --- | --- | --- |
| backend-server-key.pem | `0400` | 1000 | 1000 |
| backend-server-chain.pem | `0444` | 1000 | 1000 |
| backend-ca.pem | `0444` | 1000 | 1000 |
| admin-db-password | `0400` | 999 | 999 |
| runtime-db-password | `0440` | 1000 | 999 |

The ownership/modes appear consistent with a Web process running as UID 1000, and DB process running UID 999. However, **the actual Web container UID, secret projection permissions and ability to read the files have not been proven**. This root metadata check does not validate certificate trust/expiration, secret values, runtime configuration, effective stack, or services. No permission changes are authorized or needed from this evidence alone.

On exact commit `7f9172b11a0c6513a8ffcd59a00497feff52e45b`, **9/9 GitHub Actions workflows GREEN**, including actual isolated operational Web/PostgreSQL/mTLS integration and official Web disposable rollback. This green status belongs to that commit, not to subsequent documentation changes.

**Remaining NO-GO blockers:** operator-owned `runtime.json` still disabled in review; effective Portainer stack 90 and rollback Git commit need confirmation; actual container user/secret access and private startup conditions need controlled validation. No production modification.

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
