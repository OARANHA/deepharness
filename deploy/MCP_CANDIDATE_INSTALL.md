# Private MCP installation candidate — CI only

The bootstrap workflow builds `deploy/Dockerfile.mcp-candidate` on PRs only.
It packages the private read connector, records SHA256SUMS, and includes pinned
pnpm 11.28.5 (official upstream package manager) and js-yaml 4.3.2 for verification.
The existing production Dockerfile and Portainer stack are unchanged. This
candidate is not published to GHCR and does not configure an MCP endpoint.

The disposable proof runs with no network, no host ports, dropped capabilities,
a read-only root, and fresh tmpfs profile/workspace directories. It requires
DSH 0.2.1-alpha.2 and installs the tarball using the official command:

```
dsh plugin --profile web add --offline --ignore-scripts <private-tarball>
```

The verifier checks official bundle selection, installed plugin exports, and
boot-free `dsh web --dump-config` composition. The only allowed composition delta
is one exact disabled connector row with endpointEnabled false; all existing
configuration must remain deeply equal. Eight unit cases cover the insertion
and rejected changes, anonymous additions, duplicates, enabled rows and extra fields.

This proves installation/composition only when the CI marker
`DSH_OFFICIAL_DISABLED_PROFILE_INSTALL_MATCH` is present for the exact HEAD.
It does not boot the connector, configure an OAuth client, establish a real
ChatGPT callback, or enable production transport. Runtime/auth/grant/revocation
coverage remains in the separate integration workflows.

Next: review the successful candidate and prepare the concrete private transport
and OAuth client configuration with exact callback/resource/issuer values from
the actual ChatGPT registration. Persistent policy/grants must be explicitly
provisioned by the owner; rollback must disable the connector and revoke access.
No production installation, persistent credential, endpoint, ingress or DNS
change is authorized by this CI candidate.
