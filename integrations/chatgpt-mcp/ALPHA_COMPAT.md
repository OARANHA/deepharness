# Alpha compatibility proof — GitHub Actions only

This slice is **one CI check**: package the reviewed `dsh-chatgpt-bridge`
revision and run its existing **official-host integration tests** against the
exact `@deepseek-ai/dsh@0.2.1-alpha.2` used in Wandora.

- The reusable upstream code remains unchanged in the submodule.
- CI verifies the pinned gitlink before attempting a build.
- Both DSH and the tarball are installed in a fresh temporary directory.
- The official Web smoke uses ephemeral loopback-only ports, synthetic sessions,
  a temporary DSH_HOME, a disposable bearer token, and no model credentials.
- Node 22, `npm ci`, typecheck, package build, and native DSH session/Web/MCP
  contract tests run in GitHub Actions; **no VPS, Portainer, Traefik or deployment**.
- The package declares RC2 peer dependencies. CI uses
  `--legacy-peer-deps` **only inside the disposable test directory** and installs
  missing required `@deepseek-ai/*` runtime peers from the exact ranges declared
  by installed official host manifests. It rejects conflicting ranges and
  bounds dependency closure; it does not guess npm `latest` or patch upstream.
  This bypass probes the alpha and reveals runtime incompatibilities; green does **not**
  establish publishable peer compatibility, approval-policy safety, Agent Teams
  membership/task exposure, or connection to ChatGPT.

If red, inspect the failing import / DSH capability in the isolated action.
Do not install the plugin on the 28server as a troubleshooting shortcut.
If green, the next slice is adding read-only Agent Teams projections and
least-privilege policy on a reviewed branch before any controlled installation.

Await the owner's report on CI; **do not poll**. Keep PR stacked on the adoption
PR until explicitly merged. No merge or deploy without owner approval.
