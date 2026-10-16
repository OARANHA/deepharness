# Stage C — owner's maintenance tolerance (2026-10-16)

Owner clarified that DeepHarness **does not need to remain available during this maintenance**, and that the existing Portainer settings were created during this project. Therefore, no zero-downtime requirement and no repeated request for existing nonsecret settings. The owner previously chose Option A: preserve the existing DSH Web sessions, Agent Teams and named writable volumes; full historical-volume backup is waived.

**Important distinction:** accepting temporary downtime and waiving a complete historical backup is **not** approval to redeploy, delete or recreate volumes, alter Portainer settings, or create enabled production runtime. The stack 90 Git configuration and existing credential values still need to remain recoverable privately, even if they were initially prepared by this assistant. Never place secret values in GitHub/chat.

**Operational impact:** a maintenance window may interrupt Web, and a failed cutover may require restoring original Compose/image in **same stack ID 90**. Use existing original image and source rollback anchors, no automatic destructive cleanup. No public MCP proxy, OAuth activation or real Agent Team grants during first private cutover.

**Status:** PR #6 review only, production remains unchanged; exact owner approval for the private cutover action and runtime activation still pending.
