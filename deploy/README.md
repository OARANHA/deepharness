# Portainer deployment — 28server ONLY

**Do not deploy yet.** Required gates: source imported, green CI + built image digest, existing legacy DSH container inventory, trusted TLS origin.

## Build / supply image
- CI checks the native `node-addon-require-builtin` loader under a read-only container and builds a pinned npm-distribution bootstrap image.
- On a green push to main, GHCR image is `ghcr.io/oaranha/deepharness:sha-<full commit sha>`; use its verified immutable digest in Portainer (`ghcr.io/oaranha/deepharness@sha256:...`).
- **Code/build caveat:** bootstrap image currently installs the pinned npm package; the vendored source tree is not yet the Docker build input. Source-based packaging requires a separate CI change and successful acceptance test.

## Single-stack cutover
1. Inventory the existing `deepseek-harness` container, image, names, networks, volumes and `/opt/wandora/ops-workspace/deepseek-harness-deploy`. Record exact Docker object IDs and backup of any state. Do not delete or truncate anything yet.
2. Prove the replacement image works, then stop the old instance before enabling the new ingress route. Never publish two DeepSeek routers for `deep.wandora.com.br` simultaneously.
3. On 28server's Portainer, create a Git-backed Stack named `deepharness`, repository `https://github.com/OARANHA/deepharness`, compose path `deploy/portainer-stack.yml`, branch `main`. Prefer immutable commit pinning to automatic updates.
4. Set environment variables `DEEPHARNESS_IMAGE` and `DSH_BASIC_AUTH_USERS` through Portainer, not in Git; use a securely generated bcrypt/APR1 hash and watch Compose interpolation of `$` characters.
5. Validate container health/stability, trusted TLS at origin, Cloudflare Full(strict), Host/WebSocket routing, DSH one-time launch token, selected workspace and Chutes.ai provider.
6. Only after successful cutover and data review, separately approve removal of strictly identified obsolete DSH resources. **Never** run `docker system prune`.

## Security notes
- DSH is an unaudited developer preview that can execute commands. Keep only scoped data volumes, no `docker.sock`, no cross-project mounts, non-root runtime and an external BasicAuth gate.
- Initial launch URLs/logs can contain process credentials. Never commit or share them.
- Credentials for Chutes.ai are entered through DSH Settings → Models only after HTTPS and login.
- The public host currently had Cloudflare 526 and origin Traefik default cert; do not weaken TLS to bypass this.
