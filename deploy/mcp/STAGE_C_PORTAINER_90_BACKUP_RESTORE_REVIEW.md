# Stage C — Portainer stack 90 backup and restoration plan (review-only)

**DO NOT EXECUTE A RESTORE OR DEPLOY DURING THIS REVIEW.** Baseline verified by owner 2026-10-16: 28server stack ID 90; Git `OARANHA/deepharness`, `refs/heads/main`, `deploy/portainer-stack.yml`; two existing environment variable names `DEEPHARNESS_IMAGE`, `DSH_BASIC_AUTH_USERS`. The Web is running and original Agent Teams were visible after existing two-layer authentication.

## Separate recovery objects — do not mistake one for another

1. **Source recipe**: immutable original Git commit `b5e63748aaacc9c4f719327f9f5d9ebf300840d4`, blob `cd72a46a2e458fcc6902d3ca243ac31c2979d346`, 1787 bytes, safety ref `safety/deepharness-web-original-20261016`. Immutable original image `ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`.
2. **Portainer metadata**: current stack ID, Git reference, Compose path, auto-update settings (if any), environment variable **values** and access rights live in Portainer. A Git tag/branch does NOT back them up. Confirm an owner-held secure recovery copy using an approved Portainer backup/export method; do not print or upload environment values to GitHub/chat. No automated export attempted here.
3. **DSH state**: named writable volumes `deepharness_dsh_data` at `/data/dsh`, `deepharness_dsh_workspace` at `/workspace`, confirmed mounted on `deepharness-web-1`. Their existence and identity are NOT a restorable volume backup. Any volume backup must be planned through an owner-approved consistency procedure that does not run a second DSH instance on live volumes.
4. **MCP-only state**: prospective grants DB volume and operator runtime configuration must be handled separately. Do not delete data or enable runtime during rollback.

## Operator preparation (NO writes to stack 90)

- Record only non-secret metadata: stack ID 90, Web current image digest/restart state, exact Git ref/file path, variable **names**, container-to-volume attachments and BasicAuth route. Historical owner readback satisfied most metadata; recheck in maintenance window.
- Verify the existing Git rollback commit and original registry image remain available. The reviewed proposal `deploy/mcp/portainer-stack.stage-c.proposed.yml` is not the deployment path, and `deploy/portainer-stack.yml` remains original.
- Privately prepare an owner-held backup of current Portainer stack configuration **including all sensitive environment variable values**, using supported Portainer export/backup controls and restricted encrypted storage. Do not share the backup file, screenshots of secrets or URLs with tokens.
- Set and verify an appropriate data-volume backup method, storage location, confidentiality and restore test **in isolation**. The safest maintenance plan must account for application consistency; never claim a tar of live mutable files is necessarily a consistent backup.
- In a disposable environment with empty isolated volumes and no public ingress, validate syntax/config + recovery plan for original Compose; this does NOT replace real stack 90 recovery verification.
- Write down maintenance window, allowable downtime, named operator and abort criteria before asking permission.

## Conditional rollback method — only after separately authorized cutover

- Stop change attempts and preserve evidence; avoid blind repeats.
- Keep Portainer **same stack ID 90**. Restore its original Git source/path and owner-held env values, and the original Web image reference. Ensure original Traefik BasicAuth labels, network, data and workspace attachments exactly match baseline.
- Restore original Web functionality and verify authenticated UI, history, existing Agent Team `lead`, `arquiteto`, `revisor`, and no external MCP ingress. Do NOT remove or recreate DSH named volumes.
- Handle MCP DB/runtime separately; **do not delete** MCP grants volume during emergency recovery.
- If recovery fails, halt, retain evidence and escalate to owner incident response. No permission to weaken authentication, disable TLS, or reveal credentials.

## Approval boundaries

**Current: NO-GO.** Owner must verify Portainer recovery metadata exists securely and select maintenance policy. Stage C private single-stack cutover then needs a **specific** approval naming exact approved deployment commit, action/time and rollback. Enabling public proxy, Keycloak OAuth and real user grants is **a second, separate approval**.

This runbook is planning evidence only, not a production backup, and not proof of restoration.
