# Stage C — one-window operator execution and fallback

**Owner approved private cutover** (2026-10-16), accepts temporary outage, preserve volumes and Agent Teams. **No approval for public MCP, OAuth or real grants.** Current approved candidate: PR #6, Compose blob `b8e96a0948a823d4eec23aa1ae33e12a60a0c462`, commit prior to this guide `0048834ebcbd6c312a41e8c1ae72e973de8bda9f`; CI run `38954881707` success. Final release commit must be frozen and rechecked after any additional changes.

## Fail-closed preflight, on root@28server

The following prints **only status markers**; no secret values or authenticated DSH URL. It does NOT create files or deploy:

```bash
set -u
test "$(hostname -s)" = "28server" || { echo FAIL_WRONG_HOST; exit 1; }
test "$(id -u)" = 0 || { echo FAIL_NOT_ROOT; exit 1; }
test "$(docker inspect -f '{{.State.Running}}' deepharness-web-1 2>/dev/null)" = true || { echo FAIL_WEB_NOT_RUNNING; exit 1; }
image="$(docker inspect -f '{{.Image}}' deepharness-web-1)"
original="$(docker image inspect -f '{{.Id}}' ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075 2>/dev/null)" || { echo FAIL_ORIGINAL_IMAGE_MISSING; exit 1; }
test "$image" = "$original" || { echo FAIL_ORIGINAL_IMAGE_MISMATCH; exit 1; }
mounts="$(docker inspect deepharness-web-1 --format '{{range .Mounts}}{{println .Destination "=" .Name}}{{end}}')"
printf '%s\n' "$mounts" | grep -q '^/data/dsh = deepharness_dsh_data$' || { echo FAIL_DATA_MOUNT; exit 1; }
printf '%s\n' "$mounts" | grep -q '^/workspace = deepharness_dsh_workspace$' || { echo FAIL_WORKSPACE_MOUNT; exit 1; }
D=/opt/wandora/data/deepharness-mcp
for f in "$D/tls/backend/backend-server-key.pem" "$D/tls/backend/backend-server-chain.pem" "$D/tls/backend/backend-ca.pem" "$D/secrets/admin-db-password" "$D/secrets/runtime-db-password"; do
  test -f "$f" && test ! -L "$f" || { echo FAIL_REQUIRED_FILE; exit 1; }
done
for ref in 'ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f' 'ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210'; do
 docker image inspect "$ref" >/dev/null 2>&1 || { echo FAIL_IMAGE_NOT_LOCAL; exit 1; }
done
echo PRIVATE_CUTOVER_PREFLIGHT_PASS_NO_WRITES
```

**Gate following PASS (not automated via this root script):**
1. Verify operator-held recovery of Portainer stack **90** exact Git source, original Compose/image and secret variable values; no secret outputs.
2. Verify UID 1000 in proposed Web can actually read the protected files inside the future mounts, without relaxing permissions globally; owner-prepared bind test may be required. Production Web must NOT be started a second time on live volumes.
3. Create runtime config at `/opt/wandora/data/deepharness-mcp/review/runtime.json` only when operator access/ownership is confirmed, using **exact** schema in `STAGE_C_PRIVATE_CUTOVER_OPERATOR_APPROVAL_PACKET.md` with `enabled:true`; never commit or share secrets. The existing review fixture with `enabled:false` is not functional.
4. Ensure all required **new** Portainer variable names exist (DSH_MCP_HOST_IMAGE, DSH_MCP_GRANTS_IMAGE, DSH_MCP_PROXY_IMAGE, DSH_MCP_REVIEW_ROOT, DSH_MCP_SECRET_ROOT) with exact pinned references and approved paths; preserve existing DSH_BASIC_AUTH_USERS and DEEPHARNESS_IMAGE values.
5. Review exact final diff for `deploy/portainer-stack.yml`; this candidate exists ONLY on branch `proposal/stage-c-deployment-path-20261016`, not main. Do not deploy by repointing stack to an unreviewed branch or indiscriminately merging other PRs. A specific Git change and stack update must be planned together and revalidated.
6. Update **same** Portainer stack 90 exactly once from approved source. Check Web startup, UI login via original official DSH token, read history and Agent Team lead/arquiteto/revisor, preserved mounts, internal-only MCP listener and grants DB, no public proxy.
7. On failure STOP, roll back in same stack 90 to original source commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4` and original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`, preserve existing Portainer variables and **never delete** data/workspace/grants volumes. Confirm original Web/UI restored.

**No fully automatic Portainer apply/rollback command is claimed**: no validated Portainer 28server API session and no verified privileged remote API connected to this assistant. Blind `git merge`, `docker compose up`, or `docker stack deploy` from root would bypass Portainer source/state management and is not authorized as a substitute. Stop if metadata/variables cannot be recovered.

**GO only for bounded authorized operator preparation after PASS**. Do not claim cutover completed until same-stack deploy and verified readbacks.
