# DeepHarness ChatGPT MCP — internal read runtime

Private package @wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.2.
This is an ESM runtime and DSH/Cordis bundle for an existing initialized official host. It is not a CLI, public endpoint or deployed service. The bundle inserts one disabled row; plugin registration uses the /plugin export.

Export: createOfficialDshMcpReadRuntime(host, policy).

host supplies stable initialized workspaceRegistry, sessions and sessionProjections references. Capture official Cordis service facades once; this runtime preserves exact reference/session replacement checks.

policy supplies discovery.get() returning the validated issuer/publicKeys snapshot; independently pinned issuer and resource HTTPS URLs; authoritative PostgreSQL-primary query(sql, params, options); exact grants and allowedOrigins. Optional allowMissingNotBefore defaults false; Keycloak may require the explicit already-reviewed true policy. requiredScope is fixed to agent-teams:read. No revocation fallback.

Returns only runHttpRequest, readTeam, handleOAuthRequest. Server code must wrap every MCP dispatch with runHttpRequest; metadata/auth HTTP gate does not replace that request binding. Grant writes/revocation administration are not exported; provision grants/schema separately via trusted operator configuration. Do not pass tool arguments as policy or authenticated request.

No listener, agent creation, session cold-resume, task writes, token issuance or grants administration. Host, discovery, database driver/pool and MCP server remain caller-owned. No third-party runtime dependencies are installed by this package; driver ownership avoids hidden connection credentials/lifecycle.

Build: npm pack integrations/chatgpt-mcp --ignore-scripts (from repository root). Private:true prevents accidental registry publication. Explicit manifest whitelist excludes fixtures, upstream bridge, realm/users/credentials, deployment configs and tests. LICENSE retains the source MIT notice.

CI must install/load the actual tarball on disposable official DSH 0.2.1-alpha.2/Cordis4.0.5-alpha.1. Source tests alone do not prove packaging. This package does not enter the existing bootstrap Docker image automatically, and this increment does not change deploy/Dockerfile.

Runtime tests include query doubles; real Keycloak/JWT/official DSH/PostgreSQL lifecycle proof is separately recorded in OAUTH_CONNECTION_CONTRACT.md. Neither is real ChatGPT login or production authorization.

First production use still requires reviewed host packaging, exact callback/client/resource, TLS/mTLS or approved private transport, durable grants/revocation configuration and bounded owner canary with rollback.


## DSH/Cordis bundle

package.json declares dsh.bundle.patch=./cordis.patch.yml and exact alpha peer requirements. Peers are optional for npm installation only: the plugin still requires existing workspaceRegistry, sessions, sessionProjections and chatgptMcpReadPolicy via Cordis injection. DSH's compatibility preflight still evaluates declared DSH peers; do not grant version exemptions to bypass a mismatch.

The patch contains only wandora-chatgpt-mcp-read, disabled:true, endpointEnabled:false. No core services are inserted. Even direct plugin activation rejects endpointEnabled:true. Trusted operator code must provide chatgptMcpReadPolicy; do not put functions, grants or credentials in YAML. The plugin provides chatgptMcpRead internally with the three read-runtime methods; fiber disposal removes the service and invalidates retained/in-flight handles. It does not close host sessions or caller-owned DB/discovery resources.

After reviewed installation, the bundle row remains disabled until a separate host policy/loading decision. There is no listener in this version, including after the row is enabled. CI mounts the installed module through the official Cordis ctx.plugin contract; a full PluginManager profile-install transaction is not tested by that mount.
