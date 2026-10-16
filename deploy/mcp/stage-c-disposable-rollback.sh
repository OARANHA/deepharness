#!/usr/bin/env bash
# Disposable Docker rollback drill: infrastructure-only, NEVER production DSH.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true || { echo "CI_ONLY"; exit 1; }
test -n "${GITHUB_RUN_ID:-}" && test -n "${GITHUB_RUN_ATTEMPT:-}" || exit 1
suffix="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
name="dsh-stagec-rollback-${suffix}"
volume="${name}-workspace"
net="${name}-net"
one="${name}-web-candidate"
old="${name}-web-original"
cleanup(){
  docker rm -f "$one" "$old" >/dev/null 2>&1 || :
  docker volume rm "$volume" >/dev/null 2>&1 || :
  docker network rm "$net" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
docker volume create "$volume" >/dev/null
# Seed disposable persistent data. Never mount the real deepharness_* volumes.
docker run --rm --network none -v "$volume:/workspace" alpine:3.20 sh -ec 'printf "%s" "persisted-before-cutover" > /workspace/marker'
docker run -d --name "$one" --network "$net" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=volume,src=$volume,dst=/workspace" alpine:3.20 sleep 120 >/dev/null
test "$(docker inspect -f '{{.State.Running}}' "$one")" = true
test "$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$one")" = 0
echo 'STAGE_C_DISPOSABLE_CANDIDATE_STARTED'
# Inject a failure and restore original placeholder service on the SAME volume.
docker rm -f "$one" >/dev/null
docker run -d --name "$old" --network "$net" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=volume,src=$volume,dst=/workspace" alpine:3.20 sleep 120 >/dev/null
test "$(docker inspect -f '{{.State.Running}}' "$old")" = true
test "$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$old")" = 0
test "$(docker exec "$old" cat /workspace/marker)" = "persisted-before-cutover"
test "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Name}}{{end}}{{end}}' "$old")" = "$volume"
echo 'STAGE_C_DISPOSABLE_INFRA_ROLLBACK_MATCH'
echo 'STAGE_C_ROLLBACK_SCOPE_SYNTHETIC_NOT_ACTUAL_DSH'
