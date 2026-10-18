# Stage C — owner-confirmed live volume attachment result (2026-10-16)

Owner executed non-secret `docker inspect deepharness-web-1 --format ...` to query only two named mounts. Output:

```
DSH_DATA=deepharness_dsh_data MODE_RW=true
DSH_WORKSPACE=deepharness_dsh_workspace MODE_RW=true
```

**Verified:** existing running Web is attached at `/data/dsh` to `deepharness_dsh_data` and at `/workspace` to `deepharness_dsh_workspace`; both mounts report writable. This closes the mount-identity gate, not proof of complete backups or rollback recovery. Do not delete/recreate volumes.

**Open:** Portainer stack 90 effective Git source and env names/current rollback metadata, owner backup and exact cutover authorization, complete mTLS chain. No merge/deploy or runtime enablement; private cutover remains NO-GO.
