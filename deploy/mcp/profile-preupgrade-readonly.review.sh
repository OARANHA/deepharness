#!/usr/bin/env bash
# Operator-triggered READ-ONLY profile attestation. No installation or backup.
# Runs only on 28server; collects metadata/hashes, not profile contents.
set -Eeuo pipefail
if [[ "$(id -u)" != 0 || "$(hostname -s)" != "28server" ]]; then
  echo "DSH_PREUPGRADE_PREFLIGHT=NO_GO host_or_uid" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "DSH_PREUPGRADE_PREFLIGHT=NO_GO docker_unavailable" >&2
  exit 1
fi

# Only fixed container, non-root user, Node.js from stdin. No shell or writes
# inside the container. Never output the file content or an arbitrary env var.
docker exec -i --user 1000:1000 deepharness-web-1 \
  node --input-type=commonjs - <<'NODE'
"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const p = "/data/dsh/profiles/web";
const moduleName = "@wandora/deepharness-chatgpt-mcp-read";
const moduleDir = path.join(p, "node_modules", moduleName);

function file(location) {
  try { return fs.readFileSync(location); }
  catch { return null; }
}
function json(location) {
  const raw = file(location);
  if (raw === null) return null;
  try { return JSON.parse(raw.toString("utf8")); }
  catch { return null; }
}
function sum(location) {
  const raw = file(location);
  return raw === null ? "ABSENT" :
    crypto.createHash("sha256").update(raw).digest("hex");
}
function safeVersion(value) {
  return typeof value === "string" &&
    /^[0-9]+[.][0-9]+[.][0-9]+(?:-(?:alpha|beta|rc|lab)[.][0-9]+)?$/.test(value)
    ? value : "UNKNOWN";
}
function existsFile(location) {
  try { return fs.statSync(location).isFile(); }
  catch { return false; }
}
if (process.getuid() !== 1000) {
  console.log("DSH_PREUPGRADE_PREFLIGHT=NO_GO uid");
  process.exitCode = 1;
} else {
  const pkg = json(path.join(moduleDir, "package.json"));
  const profile = json(path.join(p, "package.json"));
  const dsh = json("/opt/dsh/node_modules/@deepseek-ai/dsh/package.json");
  const runtime = json("/etc/wandora-mcp/runtime.json");
  const exp = pkg?.exports?.["./private-semantic-http-handler"];
  const handler = exp === "./adapters/private-semantic-http-handler.mjs" &&
    existsFile(path.join(moduleDir, "adapters/private-semantic-http-handler.mjs"));
  const hostText = file("/opt/wandora-mcp-verifier/mcp/operational-host.mjs");
  const hostSupports = hostText !== null &&
    hostText.includes(Buffer.from("semanticBridge")) &&
    hostText.includes(Buffer.from("createSemanticHttpHandler"));
  const patch = file(path.join(p, "cordis.patch.yml"));
  const patchText = patch?.toString("utf8") || "";
  const pluginDisabled = patchText.includes(moduleName + "/plugin") &&
    /disabled:\s*true/.test(patchText) &&
    /endpointEnabled:\s*false/.test(patchText);
  const route = runtime === null ? "UNKNOWN" :
    !Object.hasOwn(runtime, "semanticBridge") ? "ABSENT" :
    runtime.semanticBridge?.enabled === false ? "DISABLED" :
    runtime.semanticBridge?.enabled === true ? "ENABLED" : "INVALID";

  console.log("DSH_PROFILE_VERSION=" + safeVersion(pkg?.version));
  console.log("DSH_OFFICIAL_DSH_VERSION=" + safeVersion(dsh?.version));
  console.log("DSH_PROFILE_MANIFEST=" + (profile === null ? "ABSENT" : "PRESENT"));
  console.log("DSH_PROFILE_MANIFEST_SHA256=" + sum(path.join(p, "package.json")));
  console.log("DSH_PROFILE_LOCK_SHA256=" + sum(path.join(p, "pnpm-lock.yaml")));
  console.log("DSH_PROFILE_PATCH_SHA256=" + sum(path.join(p, "cordis.patch.yml")));
  console.log("DSH_PROFILE_PLUGIN_DISABLED=" + (pluginDisabled ? "YES" : "NO_OR_UNPROVEN"));
  console.log("DSH_PROFILE_HANDLER=" + (handler ? "PRESENT" : "ABSENT"));
  console.log("DSH_PROFILE_OPERATIONAL_HOST_SEMANTIC=" +
    (hostSupports ? "PRESENT" : "ABSENT"));
  console.log("DSH_PROFILE_SEMANTIC_ROUTE=" + route);
  console.log("DSH_PROFILE_BACKUP=NOT_PERFORMED");
  console.log("DSH_PROFILE_UPGRADE=NOT_PERFORMED");
  console.log("DSH_PREUPGRADE_PREFLIGHT=READ_ONLY_COMPLETE");
}
NODE
