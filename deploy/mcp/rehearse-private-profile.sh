#!/usr/bin/env bash
# Owner-executed on 28server. Writes only a new private HOST directory and a copy.
# No production-volume write mount, Web start, database access, restart or cleanup.
set -Eeuo pipefail
trap 'status=$?; printf "PRIVATE_PROFILE_PREPARATION_DENIED line=%s status=%s\n" "$LINENO" "$status" >&2; exit "$status"' ERR
umask 077
test "$(id -u)" = 0
test "$(hostname)" = 28server
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
test -f "$script_dir/private-profile-rehearsal.mjs"
test -f "$script_dir/private-profile-cache-plan.cjs"
test -f "$script_dir/verify-candidate-image.py"
web=deepharness-web-1
image=ghcr.io/oaranha/deepharness-mcp@sha256:89879cc358ad557dfc151f401a3f796afda7e3bc19d865c99949d9f00d302fc6
test "$(docker inspect --format '{{.State.Running}}' "$web")" = true
initial_state="$(docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.RestartCount}} {{.Image}}' "$web")"
root="$(mktemp -d /root/deepharness-stage-d-rehearsal.XXXXXX)"
backup="$root/profile-snapshot"
clone="$root/private-clone"
mkdir -p "$backup/profiles" "$clone" "$root/review"
cp -- "$script_dir/private-profile-rehearsal.mjs" "$root/review/"
printf 'private-profile-copy-only\n' > "$root/review/CLONE_ONLY"
# Only control-file hashes go to stdout; no manifest, lock, patch or secret values.
fingerprint(){
  docker exec --user node "$web" node -e '
    const fs=require("node:fs"),crypto=require("node:crypto");
    const files=["profiles/web/package.json","profiles/web/pnpm-lock.yaml","profiles/web/cordis.patch.yml","cordis.patch.yml"];
    const out={};for(const file of files){try{out[file]=crypto.createHash("sha256").update(fs.readFileSync("/data/dsh/"+file)).digest("hex")}
    catch(e){if(e.code!=="ENOENT")throw e;out[file]=null}}
    console.log(JSON.stringify(out));
  '
}
fingerprint > "$root/source-before.json"
docker cp "$web:/data/dsh/profiles/web" "$backup/profiles/" >/dev/null
# Copy the optional patch separately. pnpm project-registration links are NOT
# package cache data and Docker correctly refuses their extraction; never copy
# or follow them, and never change the source links to get past that refusal.
for path in cordis.patch.yml; do
  if docker exec --user node "$web" node -e 'process.exit(require("node:fs").existsSync("/data/dsh/"+process.argv[1])?0:1)' "$path"; then
    mkdir -p "$backup/$(dirname -- "$path")"
    docker cp "$web:/data/dsh/$path" "$backup/$path" >/dev/null
  fi
done
docker exec -i --user node "$web" node - < "$script_dir/private-profile-cache-plan.cjs" > "$root/cache-paths.txt"
while IFS= read -r path; do
  mkdir -p "$backup/$(dirname -- "$path")"
  docker cp "$web:/data/dsh/$path" "$backup/$path" >/dev/null
done < "$root/cache-paths.txt"
fingerprint > "$root/source-after-copy.json"
cmp --silent "$root/source-before.json" "$root/source-after-copy.json"
cp -a -- "$backup/." "$clone/"
chown -hR 1000:1000 "$clone"
# The immutable image must be pulled before starting the disconnected rehearsal.
docker pull "$image" >/dev/null
docker image inspect "$image" > "$root/candidate-local.json"
docker manifest inspect "$image" > "$root/candidate-registry.json"
python3 "$script_dir/verify-candidate-image.py" "$root/candidate-local.json" "$root/candidate-registry.json"
# /root remains0700; review contents themselves need read/traverse for UID1000.
chmod 0755 "$root/review"
chmod 0644 "$root/review/CLONE_ONLY" "$root/review/private-profile-rehearsal.mjs"
printf 'PRIVATE_PROFILE_SNAPSHOT_READY %s\n' "$root"
status=0
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 1000:1000 --pids-limit 256 --memory 2g --cpus 1 --no-healthcheck \
  --tmpfs /tmp:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=1g \
  --mount "type=bind,source=$clone,target=/data/dsh" \
  --mount "type=bind,source=$root/review,target=/review,readonly" \
  -e HOME=/data/dsh -e DSH_HOME=/data/dsh -e DSH_MCP_PRIVATE_REHEARSAL=offline-copy-only \
  --entrypoint node "$image" /review/private-profile-rehearsal.mjs || status=$?
fingerprint > "$root/source-after-rehearsal.json"
cmp --silent "$root/source-before.json" "$root/source-after-rehearsal.json"
test "$(docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.RestartCount}} {{.Image}}' "$web")" = "$initial_state"
printf 'PRODUCTION_PROFILE_CONTROL_FILES_AND_WEB_UNCHANGED\n'
exit "$status"
