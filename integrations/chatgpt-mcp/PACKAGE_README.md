# DeepHarness ChatGPT MCP — private read plugin package

Private package `@wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.4`, pinned to official DSH 0.2.1-alpha.2 / Cordis 4.0.5-alpha.1. The DSH bundle patch installs a default-disabled row with `endpointEnabled: false`. No listener, agent execution, session creation, task mutation, token issuance or grant administration is provided.

## Existing host and policy

`createOfficialDshMcpReadRuntime(host, policy)` composes stable initialized workspaceRegistry, sessions and sessionProjections services. It returns runHttpRequest, readTeam and handleOAuthRequest only; the original API is unchanged. Host replacement/session checks, issuer pinning, exact audience/scope, authoritative token revocation and grant revalidation remain mandatory.

The `/plugin` entry mounts the internal `chatgptMcpRead` service using Cordis injection of those services and trusted `chatgptMcpReadPolicy`. Operational policy uses `/policy` and PostgreSQL-primary exact grants, without static fallback. Discovery/database drivers are supplied and owned by the embedding host. Credentials, policy functions and authenticated identity must never come from YAML or MCP tool arguments.

## Packaged private transport

The internal service additionally exposes `createPrivateTransport(options)` to trusted embedding code. This creates a handler, never a server or listener. It requires explicit `enabled: true`, caller-owned `McpServer`, `StreamableHTTPServerTransport` and strict SDK-compatible inputSchema. Optional maxBodyBytes/timeoutMs retain the approved bounds. No service, resource or origin override is accepted: the factory binds its guarded read service and snapshots resource/allowedOrigins from the mounted policy.

Only one successful handler construction is allowed per plugin mount. Reload the plugin to replace it. Cordis disposal invalidates the read service and disposes the handler; retained handler calls return 503, and retained factory calls deny. Existing boundary checks remain: direct verified mTLS peer, exact Host/Origin, independent OAuth bearer authorization, stateless SDK instance per request, sole dsh_read_agent_team tool, bounded body/time/concurrency. Forwarded certificate headers are never TLS proof. The embedding host must own a separately reviewed TLS listener/proxy; the plugin cannot activate one through YAML.

No third-party runtime dependencies are installed by this package. The host supplies SDK classes/schema and database/discovery lifecycle. The 27-file manifest whitelist includes the approved transport and read-tool registrar, excludes fixtures, credentials and tests, and preserves MIT LICENSE.

## Evidence and remaining gates

Build with `npm pack ./integrations/chatgpt-mcp --ignore-scripts`. CI installs the actual tarball offline, imports its plugin/policy, and exercises mTLS and the official initialized host. Required new evidence: `PACKED_PRIVATE_MTLS_OFFICIAL_DSH_MCP_MATCH`, including automatic transport disposal on unload. At preparation time this increment's CI is pending; local packaging/lifecycle tests do not prove official-host runtime.

The previous combined human Keycloak → mTLS MCP → official DSH → real PostgreSQL laboratory gate passed on 3d2f727. Its network probe uses source modules and is a separate evidence boundary from the installed-package test (test-signed JWT/query double). Neither demonstrates actual ChatGPT login or authorizes production.

The production bootstrap image still does not automatically include/activate this connector. Actual callback/client registration, issuer/resource, proxy compatibility (including Origin), persistent operator provisioning, deployment authorization and a bounded owner query with rollback remain separate gates. No real endpoint or credential values are invented here.
