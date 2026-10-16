## Restricted-agent readback — 2026-10-16

- Agent `medicspro-managed-admin` executed a metadata-only `fs.statSync` probe of the six protected host paths: every request returned `EACCES`. That is a privilege-boundary result, **not** proof of missing or broken files.
- `docker_inspect_safe` for `deepharness-web-1` returned `CONTAINER_NOT_ALLOWED` because the target's container allowlist is empty. Live container inspection from that target is unavailable.
- No privilege escalation, secret read, container start, Portainer write or production file modification was performed.
- Owner root read-only inspection, or a separately authorized safe read capability, remains required. Do not weaken host directory permissions to facilitate a remote probe. **NO-GO.**

# Stage C — owner read-only 28server preflight (NO-GO until reviewed)

This is **not** a deploy script. Run by owner only, in a maintenance planning session. No credentials or certificate contents must be copied into chat. **Never run docker compose up, docker stack deploy, docker run mounting DSH production volumes, portainer update, git checkout on production, or enable runtime here.**

## Known immutable reference

Portainer 28server existing stack ID 90; current source `refs/heads/main` file `deploy/portainer-stack.yml`. Git blob to preserve: `cd72a46a2e458fcc6902d3ca243ac31c2979d346`; original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`. Both `deepharness_dsh_data` and `deepharness_dsh_workspace` must stay attached.

## Read-only commands (do not print values)

Run from authorized **28server root shell** only. Share only the resulting non-secret summary, not full inspect output.

```bash
set -eu
docker ps --filter name=deepharness-web-1 --format 'name={{.Names}} image={{.Image}} status={{.Status}}'
docker inspect deepharness-web-1 --format 'restart={{.RestartCount}} imageId={{.Image}}'
docker volume inspect deepharness_dsh_data deepharness_dsh_workspace --format 'volume={{.Name}} driver={{.Driver}}'
docker image inspect \
  ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075 \
  ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f \
  ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210 \
  --format 'localImageId={{.Id}}'
```

Check only host-path **existence** without attempting to read contents, and without recursively traversing protected directories. Run the following only if the target owner agrees to metadata disclosure; for EACCES use authorized local root terminal:

```bash
for path in \
  /opt/wandora/data/deepharness-mcp/review/runtime.json \
  /opt/wandora/data/deepharness-mcp/tls/backend/backend-server-key.pem \
  /opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem \
  /opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem \
  /opt/wandora/data/deepharness-mcp/secrets/admin-db-password \
  /opt/wandora/data/deepharness-mcp/secrets/runtime-db-password; do
  if test -f "$path"; then printf 'PRESENT %s\n' "$path"; else printf 'ABSENT_OR_INACCESSIBLE %s\n' "$path"; fi
done
```

Expected today: runtime.json **ABSENT**; this is intentional. **Do not create an enabled runtime or change permissions** at the preflight stage.

## Portainer controls (manual read-only UI check, no secret values)

Verify you are using **28server** Portainer stack ID **90** rather than a different Portainer instance. Verify stack Git source ref, file path, service name, update method, existing env **variable names** `DEEPHARNESS_IMAGE`, `DSH_BASIC_AUTH_USERS`; do not display credential values. Record non-secret effective network, service/volumes and last known-good image reference. Do not click **Pull and redeploy**, **Update stack**, or **Remove**. A frozen Git source alone does not capture Portainer DB credentials, env values or volumes.

## Cutover readiness decision

No deployment request until:
- A final **deployment-path** diff has been explicitly prepared and reviewed. This proposal does NOT modify `deploy/portainer-stack.yml`, thus is not deployable by stack 90 as-is.
- Runtime enabled:true is created only during explicitly approved maintenance, backed by a secure operator-controlled configuration procedure, never checked into Git.
- Baseline Web/Agent Teams, internal networks, mTLS validity, OIDC discovery, grants DB restrictive roles and return-to-original rollback capability are evidenced.
- Owner explicitly approves the precise maintenance window, single stack update, expected interruption, abort and rollback.

Private cutover and public OAuth/Envoy/ChatGPT connector activation are **separate approvals**.

**Current decision: NO-GO.**
