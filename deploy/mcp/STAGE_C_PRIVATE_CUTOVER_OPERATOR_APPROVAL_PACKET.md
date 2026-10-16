# Stage C — private cutover operator checklist / owner approval request

**NOT AN AUTHORIZATION.** Target: 28server, existing Portainer stack ID 90, Git-backed main, deploy/portainer-stack.yml. Draft PR #6 deploy-path head after CI fix: `f89a4ee34a2d847b8ae6093115e87914dba4018a`, workflow `38954038193` SUCCESS. Source PR #5 contains the review package.

## Desired end state (first private stage only)
- Exactly one Web, same original named volumes `deepharness_dsh_data` and `deepharness_dsh_workspace`, original human Web authentication and Agent Teams.
- Private MCP backend on isolated internal Docker network and dedicated grants DB; no host ports, no public MCP listener/Traefik exposure, proxy profile OFF, Keycloak OAuth clients remain disabled, no live grants.
- Existing Portainer env values are retained privately (including DEEPHARNESS_IMAGE and DSH_BASIC_AUTH_USERS); do NOT post those values or an authenticated DSH URL.

## Operator-owned runtime (NOT YET PRESENT)
The operational host parser accepts **exactly** this shape. The reviewed file remains `enabled:false`; only an owner-authorized maintenance step may create the following true-valued runtime at `/opt/wandora/data/deepharness-mcp/review/runtime.json` (bind target `/etc/wandora-mcp/runtime.json`):

```json
{
  "version": 1,
  "enabled": true,
  "issuer": "https://id.wandora.com.br/realms/deepharness",
  "resource": "https://dsh-mcp.wandora.com.br/mcp",
  "backendPort": 3443,
  "allowedOrigins": ["https://chatgpt.com", "https://chatgpt-mtls-proxy.invalid"]
}
```

**This is not an instruction to create or enable the file now.** The URL labeled as the `resource` is the identifier in the authorization contract, not proof of an enabled public endpoint. Avoid chmod/chown of existing certificate or secret files. Reconcile operator directory ownership/modes before maintenance.

## Minimal prerequisites for one maintenance decision
1. Portainer current stack configuration and *values* privately recoverable by owner. Full historical conversation backups are explicitly waived, but volumes must not be deleted or recreated; accept possible data-loss irrecoverability.
2. Exact operator approval of deployment commit, allowed maintenance time, interruption tolerance, owner to decide rollback and recovery method. A fresh CI success on the approved immutable head is required.
3. Verify source branch change is only intended Compose + CI; original immutable Web image and source rollback `b5e63748aaacc9c4f719327f9f5d9ebf300840d4` reachable. Do not merge PR #4 wholesale.
4. Existing prepared backend TLS materials and restricted database secret files must remain available without exposing bytes. Initial Web launch fails closed on invalid runtime, disabled/missing secret, DB role, OIDC discovery, network alias, or listener failure.

## One authorized maintenance sequence (future, no execution now)
1. Take non-secret Web/session baseline and privately secure Portainer config values. Confirm stack ID 90 and exact Git deployment ref.
2. Owner/operator creates validated runtime.json with `enabled:true` and required permissions and updates needed *new* Portainer variable names using secret-safe UI. Preserve existing variables exactly.
3. Owner merges/references **only** the explicitly approved exact deployment commit into the Git-backed source and executes **one** Pull and redeploy of existing stack 90. No automatic updates, no second stack or Web.
4. Check Web BasicAuth and DSH token login; previous session and lead/arquiteto/revisor listing; original two writable mounts; single Web; private DB grants reader strictly read-only; internal MCP listener protected by mTLS; and external MCP remains denied.
5. Abort on any failure and restore same stack 90 from original Compose/image and existing Portainer values without touching named volumes. Keep MCP grants data for investigation.

## Open condition and authorization
**NO-GO now** because runtime not yet present, configuration recovery not independently demonstrated, and owner has not approved the exact cutover action/time. Ask owner for explicit first-stage change authorization only after they confirm maintenance preferences. This authorization must not be interpreted as approval to expose the proxy or turn on OAuth/grants; those are stage two.