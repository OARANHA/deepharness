#!/usr/bin/env bash
# Read-only, non-secret 28server preflight. Run manually as root on the intended host.
set -euo pipefail
printf 'DSH_PREFLIGHT_V1\n'
if [ "$(id -u)" -ne 0 ]; then echo 'BLOCKED_NOT_ROOT'; exit 2; fi
if ! command -v docker >/dev/null; then echo 'BLOCKED_DOCKER_UNAVAILABLE'; exit 2; fi
web='deepharness-web-1'
if ! docker container inspect "$web" >/dev/null 2>&1; then
  echo 'BLOCKED_WEB_NOT_FOUND'; exit 2
fi
web_id="$(docker inspect "$web" --format '{{.Image}}')"
expected_original='sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075'
echo "WEB_STATE=$(docker inspect "$web" --format '{{.State.Status}}')"
echo "WEB_RESTARTS=$(docker inspect "$web" --format '{{.RestartCount}}')"
if [ "$web_id" = "$expected_original" ]; then echo 'WEB_ORIGINAL_IMAGE_MATCH'; else echo 'WEB_IMAGE_CHANGED_REQUIRES_REVIEW'; fi
for volume in deepharness_dsh_data deepharness_dsh_workspace; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then echo "PRESENT_VOLUME=$volume"; else echo "MISSING_VOLUME=$volume"; fi
done
for ref in \
  'ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075' \
  'ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f' \
  'ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210'; do
  name="${ref%%@*}"
  if docker image inspect "$ref" >/dev/null 2>&1; then echo "IMAGE_PRESENT=$name"; else echo "IMAGE_ABSENT=$name"; fi
done
for item in \
  '/opt/wandora/data/deepharness-mcp/review/runtime.json' \
  '/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-key.pem' \
  '/opt/wandora/data/deepharness-mcp/tls/backend/backend-server-chain.pem' \
  '/opt/wandora/data/deepharness-mcp/tls/backend/backend-ca.pem' \
  '/opt/wandora/data/deepharness-mcp/secrets/admin-db-password' \
  '/opt/wandora/data/deepharness-mcp/secrets/runtime-db-password'; do
  if [ -f "$item" ]; then echo "FILE_PRESENT=$item"; else echo "FILE_ABSENT=$item"; fi
done
echo 'DSH_PREFLIGHT_READ_ONLY_DONE'
