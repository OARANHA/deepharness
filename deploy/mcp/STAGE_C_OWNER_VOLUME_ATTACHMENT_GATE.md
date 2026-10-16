# Stage C — verify original Web Docker volume attachments without secrets

**NO-GO; owner root read-only command; never output the whole Docker inspect.**

On `root@28server` run:

```bash
docker inspect deepharness-web-1 --format '{{range .Mounts}}{{if eq .Destination "/data/dsh"}}DSH_DATA={{.Name}} MODE_RW={{.RW}}{{println}}{{end}}{{if eq .Destination "/workspace"}}DSH_WORKSPACE={{.Name}} MODE_RW={{.RW}}{{println}}{{end}}{{end}}'
```

Expected named mounts:

- `DSH_DATA=deepharness_dsh_data` at `/data/dsh`.
- `DSH_WORKSPACE=deepharness_dsh_workspace` at `/workspace`.

The `MODE_RW` flag reports whether the mount is writable, not whether the actual DSH data or session persistence is healthy. This template outputs only two mount names/destinations and their writable flag; it does not print credential environment variables, mounts unrelated to DSH, tokens or raw Docker metadata. If output is absent/mismatched, **stop and investigate**, do not create/recreate volumes or restart the Web.

After mount binding confirmation, separately verify Portainer stack 90 exact Git ref/file path and original env variable **names only**, and arrange an owner-approved backup/rollback procedure. Existing source rollback ref is not a backup of Portainer operational metadata. No cutover until separately approved.
