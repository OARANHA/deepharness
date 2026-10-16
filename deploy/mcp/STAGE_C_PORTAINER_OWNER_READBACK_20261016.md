# Stage C — owner Portainer stack 90 readback (2026-10-16)

Owner explicitly reported `PORTAINER OK` after checking these four **read-only** items in the Portainer UI for **28server stack 90**:

- Git repository: `OARANHA/deepharness`.
- Git reference: `refs/heads/main`.
- Compose file path: `deploy/portainer-stack.yml`.
- Existing Portainer environment **variable names** present: `DEEPHARNESS_IMAGE`, `DSH_BASIC_AUTH_USERS`; their values were not requested, read or stored.

**Assessment:** current stack Git wiring and names match the documented baseline, based on owner readback. This does not prove Portainer stack export/restore success, backed-up environment values, a tested update-and-rollback, or readiness of an enabled operational MCP runtime. Existing `deploy/portainer-stack.yml` remains unchanged in PR #5; the proposed Stage C Compose is only a non-applied review artifact.

**Cutover: NO-GO.** Outstanding: explicitly approved backup/restore plan with operator holding credentials, full mTLS certificate-chain/key match validation without disclosure, approved runtime location/permissions, exact deployment commit and maintenance authorization. No merge, redeploy, OAuth activation or public MCP listener.
