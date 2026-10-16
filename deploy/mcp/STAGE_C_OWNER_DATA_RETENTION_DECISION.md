# Stage C — Owner retention decision (2026-10-16)

**Option A selected:** preserve existing DeepHarness Web, sessions, and Agent Teams; do not require full historical conversation/volume backups as a cutover prerequisite.

## Scope and risks
- Waiver of comprehensive history backup is not authorization to delete, reset, recreate, or migrate current volumes destructively. A clean installation is NOT approved.
- Owner accepts that if existing data becomes corrupted/lost, full recovery may be impossible without backups. Never claim risk-free rollback.
- Maintain exact original Web image, Traefik BasicAuth, DSH internal token auth, and mounts: deepharness_dsh_data at /data/dsh, deepharness_dsh_workspace at /workspace. No second Web on production volumes.
- Require minimum recoverability of Portainer stack 90 configuration: verified original Git reference/path/image, and private owner-held/recoverable environment variable values. Never transmit credentials to chat/GitHub.
- Still require full certificate chain/identity and key-match validation, effective Compose and safe single-stack deployment review, CI, disabled runtime until approved.
- First specific authorization required for private single-stack deployment (exact commit, procedure, abort and rollback). Another separate authorization required for public MCP ingress/Keycloak OAuth/grants/ChatGPT canary.

## Evidence already reviewed
- Owner screenshots verified Web login, readable session and lead/arquiteto/revisor under Agent Team (not proof of MCP read).
- Owner confirmed two backend X.509 PEM first-cert expiration checks >24h (not full mTLS).
- Owner confirmed original two writable Web mounts and Portainer stack 90 Git source/branch/file and env variable names.
- PR #5 is draft/review-only; deploy/portainer-stack.yml remains unchanged.

**Decision: historical backup gate waived; private cutover remains NO-GO pending technical checks and explicit approval.**