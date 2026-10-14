# DeepHarness ChatGPT MCP — internal read runtime

Private package @wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.1.
This is an ESM library for an existing initialized official DSH host, not a dsh plugin add installer, CLI, public endpoint or deployed service.

Export: createOfficialDshMcpReadRuntime(host, policy).

host supplies stable initialized workspaceRegistry, sessions and sessionProjections references. Capture official Cordis service facades once; this runtime preserves exact reference/session replacement checks.

policy supplies discovery.get() returning the validated issuer/publicKeys snapshot; independently pinned issuer and resource HTTPS URLs; authoritative PostgreSQL-primary query(sql, params, options); exact grants and allowedOrigins. Optional allowMissingNotBefore defaults false; Keycloak may require the explicit already-reviewed true policy. requiredScope is fixed to agent-teams:read. No revocation fallback.

Returns only runHttpRequest, readTeam, handleOAuthRequest. Server code must wrap every MCP dispatch with runHttpRequest; metadata/auth HTTP gate does not replace that request binding. Grant writes/revocation administration are not exported; provision grants/schema separately via trusted operator configuration. Do not pass tool arguments as policy or authenticated request.

No listener, agent creation, session cold-resume, task writes, token issuance or grants administration. Host, discovery, database driver/pool and MCP server remain caller-owned. No third-party runtime dependencies are installed by this package; driver ownership avoids hidden connection credentials/lifecycle.

Build: npm pack integrations/chatgpt-mcp --ignore-scripts (from repository root). Private:true prevents accidental registry publication. Explicit manifest whitelist excludes fixtures, upstream bridge, realm/users/credentials, deployment configs and tests. LICENSE retains the source MIT notice.

CI must install/load the actual tarball on disposable official DSH 0.2.1-alpha.2/Cordis4.0.5-alpha.1. Source tests alone do not prove packaging. This package does not enter the existing bootstrap Docker image automatically, and this increment does not change deploy/Dockerfile.

Runtime tests include query doubles; real Keycloak/JWT/official DSH/PostgreSQL lifecycle proof is separately recorded in OAUTH_CONNECTION_CONTRACT.md. Neither is real ChatGPT login or production authorization.

First production use still requires reviewed host packaging, exact callback/client/resource, TLS/mTLS or approved private transport, durable grants/revocation configuration and bounded owner canary with rollback.
