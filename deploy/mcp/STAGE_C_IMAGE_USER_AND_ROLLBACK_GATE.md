# Stage C — host identity and Portainer rollback readback (owner gate)

Last reviewed: 2026-10-16. No deploy authorization; only read-only metadata.

Existing evidence: 9/9 workflows passed on commit `607465d41b1e64f0223ef5c1f366bca4204d8368`. Four pinned images confirmed on 28server. Five protected host files confirmed regular with modes: backend key 0400 UID1000, certificate/CA 0444 UID1000, DB admin 0400 UID999, runtime password 0440 UID1000 GID999. **These do not prove container UID or readability.**

The Stage C Compose explicitly sets `user: 999:999` for grants DB and `user: 1000:1000` for optional proxy. It does NOT set `user:` for Web, so Web depends on image `Config.User`. If Web runs other than UID 1000, the 0400 backend private key will not be readable. The grants service may receive Compose secret projection via its container secrets implementation; verify readability under the effective container user, not just host owner.

Attempted `docker image inspect --format '{{.Config.User}}'` from unprivileged MCP execution target returned UNAVAILABLE for all three: access to daemon is not available through this target. **Do not infer empty user or mismatch.**

## One-time owner read-only probe — on root@28server

```bash
for item in \
 'ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075' \
 'ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f' \
 'ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210'
do
  docker image inspect "$item" --format 'IMAGE={{index .RepoTags 0}} USER={{json .Config.User}} ID={{.Id}}' 2>/dev/null \
    || docker image inspect "$item" --format 'USER={{json .Config.User}} ID={{.Id}}'
done
docker inspect deepharness-web-1 --format 'CURRENT_WEB_USER={{json .Config.User}} CURRENT_WEB_IMAGE={{.Config.Image}}'
```

Do not paste environment variables, secrets or BasicAuth credentials. If image repo tags are absent, using `index .RepoTags 0` might error; the fallback omits repo tag. An empty image user means default root unless overridden at container creation. **Never change secret modes or force the container user based only on the image metadata.**

## Original stack 90 — rollback reference still blocked

Existing source evidence: Portainer 28server stack ID 90, `OARANHA/deepharness`, `refs/heads/main`, `deploy/portainer-stack.yml`, manual pull-and-redeploy; saved file hash `e50ee3b6c394c04ad0fb3248b7550dac2b5b64fe7deea0d0c062c8c756f92758`. Original Web image ref pinned:
`ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075`.

**Exact currently deployed Git commit SHA is not established** by equality of saved Compose content. Before cutover, capture it from trusted Portainer Git deployment metadata if available; otherwise produce an independently verified rollback ref/branch that contains the exact original Compose and never assume HEAD of main remains unchanged. A Git-backed stack change requires a separate owner-approved operation and an exact rollback plan. Do not read `portainer.db` or `stack.env` for this gate.

**Decision remains NO-GO** until Web UID/secret projection gate, runtime.json activation under approval, redacted effective Compose and exact rollback source are proven.
