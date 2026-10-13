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

The official alpha loader rejects the RC2 peer version metadata before bridge startup.\nFor contract probing only, the smoke checks all five upstream RC2 peer pins and\nthe installed official alpha peers, then replaces those five version strings in\nthe **installed, disposable** bridge package manifest. It does not modify the\npinned upstream or packaged tarball and does not grant a DSH version exemption.\nEven if this adapted test passes, the original tarball remains rejected by the\nalpha loader; publishing requires a separate reviewed compatibility release.\n\nIf red, inspect the failing import / DSH capability in the isolated action.
Do not install the plugin on the 28server as a troubleshooting shortcut.
If green, the next slice is adding read-only Agent Teams projections and
least-privilege policy on a reviewed branch before any controlled installation.

Await the owner's report on CI; **do not poll**. Keep PR stacked on the adoption
PR until explicitly merged. No merge or deploy without owner approval.

## Observed alpha gap (2026-10-13)

Run 38351900209: isolated bridge starts; MCP initialize, tools/list and
health calls return HTTP 200; standalone session/approval contract passes.
However, `dsh_health.capabilities.webSurface` is `false` while the pinned
upstream Web integration contract requires `true`. The pinned bridge source
computes this as `apiProxy !== undefined || ctx.get('webRuntime') !== undefined`.
This is a **real unresolved Web integration capability gap** on alpha, not an
npm dependency or version-metadata failure. Do not invert/omit the assertion,
forge the health response, or count the gate as green. Investigate the official
alpha Web service contract and implement a reviewed compatibility adapter in a
separate port slice before re-running the unchanged security assertions.

## Scoped Web runtime alpha adapter probe

The alpha Web bundle provides `webRuntime` as a Cordis service after its host
startup barrier. In the pinned bridge, health checks `ctx.get('webRuntime')`
from the bridge context, which may not have the Web service in scope. This CI
slice patches **only the disposable installed bridge JS**, wiring a Cordis
`ctx.inject(['webRuntime'])` observer. `webSurface` becomes true only after an
actual service object can be retrieved from the injected context; the existing
apiProxy check is preserved. Existing bearer-token, origin, session and MCP
assertions remain unchanged. The pin, packed source, and production remain
untouched. A green result is still a compatibility probe, not a release.
