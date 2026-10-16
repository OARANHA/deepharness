#!/usr/bin/env bash
# Real official DSH Web recovery rehearsal; disposable CI resources only.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || { echo 'CI_ONLY'; exit 1; }
: "${STAGE_C_OFFICIAL_DSH_IMAGE:?Provide image built from pinned official deploy/Dockerfile in this CI job}"
prefix="dsh-official-rollback-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
net="${prefix}-internal"
data="${prefix}-data"
workspace="${prefix}-workspace"
original="${prefix}-original"
candidate="${prefix}-candidate"
restored="${prefix}-restored"
cleanup(){
  docker rm -f "$original" "$candidate" "$restored" >/dev/null 2>&1 || :
  docker volume rm "$data" "$workspace" >/dev/null 2>&1 || :
  docker network rm "$net" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
docker volume create "$data" >/dev/null
docker volume create "$workspace" >/dev/null
# Use a separate ephemeral helper; never mount live deepharness_dsh_data/workspace.
docker run --rm --network none -v "$workspace:/workspace" alpine:3.20 sh -ec 'printf "%s" "original-workspace-preserved" > /workspace/rollback-marker'
run_web(){
  local cname="$1"
  docker run -d --name "$cname" --network "$net" --read-only --init --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 256 --memory 2g \
    --tmpfs /tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777 \
    -v "$data:/data/dsh" -v "$workspace:/workspace" \
    "$STAGE_C_OFFICIAL_DSH_IMAGE" sh -ec \
    'exec dsh web --no-open --port 3080 --host 127.0.0.1 --public-url https://deep.wandora.com.br/ --trusted-host deep.wandora.com.br' >/dev/null
}
assert_web(){
  local cname="$1" healthy=false
  for i in $(seq 1 60); do
    if [[ "$(docker inspect --format '{{.State.Running}}' "$cname")" != true ]]; then
      echo 'DSH_WEB_EXITED_BEFORE_READY'; return 1
    fi
    if docker exec "$cname" node -e 'const http=require("http");const q=http.get("http://127.0.0.1:3080/",r=>{r.resume();process.exit(r.statusCode>=200&&r.statusCode<500?0:1)});q.on("error",()=>process.exit(1));q.setTimeout(1000,()=>{q.destroy();process.exit(1)})' >/dev/null 2>&1; then healthy=true;break; fi
    sleep 2
  done
  [[ "$healthy" == true ]] || { echo 'DSH_WEB_NOT_READY';return 1; }
  [[ "$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$cname")" == 0 ]]
}
run_web "$original"
assert_web "$original"
echo 'STAGE_C_ORIGINAL_OFFICIAL_DSH_WEB_HTTP_READY'
docker rm -f "$original" >/dev/null
# Simulate a candidate crash without a second DSH process or an exposed port.
docker run --name "$candidate" --network "$net" --read-only --cap-drop ALL \
  -v "$data:/data/dsh" -v "$workspace:/workspace" \
  "$STAGE_C_OFFICIAL_DSH_IMAGE" node -e 'process.exit(23)' >/dev/null 2>&1 && { echo 'CANDIDATE_SHOULD_FAIL';exit 1; }
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$candidate")" == 23 ]]
docker rm -f "$candidate" >/dev/null
run_web "$restored"
assert_web "$restored"
[[ "$(docker exec "$restored" cat /workspace/rollback-marker)" == original-workspace-preserved ]]
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/dsh"}}{{.Name}}{{end}}{{end}}' "$restored")" == "$data" ]]
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Name}}{{end}}{{end}}' "$restored")" == "$workspace" ]]
echo 'STAGE_C_OFFICIAL_DSH_WEB_RESTORED_HTTP_MATCH'
echo 'STAGE_C_NO_PRODUCTION_VOLUME_OR_PUBLIC_PORT_MATCH'
