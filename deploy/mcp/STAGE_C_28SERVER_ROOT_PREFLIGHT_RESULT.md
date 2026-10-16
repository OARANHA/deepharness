# Stage C — root owner preflight result — 2026-10-16

**Evidence:** owner-provided stdout from `bash /tmp/dsh-owner-preflight.sh` on `root@28server`, script identity `DSH_PREFLIGHT_V1`, final marker `DSH_PREFLIGHT_READ_ONLY_DONE`.

## Observed

| Gate | Output | Assessment |
| --- | --- | --- |
| Existing official Web | `WEB_STATE=running` | PASS (state only) |
| Web restarts | `WEB_RESTARTS=0` | PASS |
| Original immutable image | `WEB_ORIGINAL_IMAGE_MATCH` | PASS |
| DSH data volume | `PRESENT_VOLUME=deepharness_dsh_data` | PASS (exists; no data/content integrity assertion) |
| DSH workspace volume | `PRESENT_VOLUME=deepharness_dsh_workspace` | PASS (exists; no attachment/data assertion) |
| Local image refs | original Web, MCP host, grants | PASS (present) |
| Backend TLS | key, chain, CA files `FILE_PRESENT` | PASS (existence, not expiry/trust) |
| Grants secrets | admin/runtime DB password files `FILE_PRESENT` | PASS (existence, not content) |
| Operational runtime file | `FILE_ABSENT=/opt/wandora/data/deepharness-mcp/review/runtime.json` | EXPECTED **NO-GO** before approval |
| Complete execution | `DSH_PREFLIGHT_READ_ONLY_DONE` | PASS (script completion only) |

This supersedes the earlier restricted-agent `EACCES` uncertainty **for file existence only**. Do not infer Web login, Agent Teams read continuity, present Portainer source/env or proven rollback capability from this output. The existing sensitive file contents were not read.

## Remaining release gates

1. Baseline actual Web/Agent Teams end-to-end health and original named volume **attachments**, not merely existence; verify Portainer stack 90 Git source and env **names** at change window.
2. Non-secret mTLS certificate validity and OIDC discovery, DB restricted role and authorized runtime path ownership; no production mount or second Web canary before approval.
3. Produce and verify a **separate exact deployment-path** proposed `deploy/portainer-stack.yml` diff. Current PR #5 must remain REVIEW ONLY and current production Compose unchanged.
4. Owner maintenance window and explicit approval for one private stack 90 update with rollback. Public Envoy ingress, OAuth, real grants/ChatGPT connection are a separate future approval.

**Decision: preflight evidence GREEN with expected runtime ABSENT; production cutover still NO-GO.**
