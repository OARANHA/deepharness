# Private profile rehearsal — no deployment

Owner readback confirms HOME=DSH_HOME=/data/dsh, real profile at
`/data/dsh/profiles/web`, package/lock/node_modules/.pnpm/user patch present,
and no global `cordis.patch.yml`. The `.modules.yaml` diagnostic returned no
store paths; do not assume that a particular pnpm cache is populated.

`rehearse-private-profile.sh` is a narrowly scoped owner-executed preparation
for 28server. It creates a new0700 directory under `/root`, copies the existing
Web profile plus present fixed pnpm cache paths, retains that private snapshot,
and works on a separate copy. It never mounts production volumes into the
rehearsal, starts Web, connects to PostgreSQL, stops/restarts anything or cleans
Docker. Profile/cache content stays on the server; do not upload these copies.
This is a profile snapshot, NOT an application/database-consistent backup.

Owner attempt using e080 stopped during Docker copy of the full pnpm store:
Docker rejected a relative symlink under `v11/projects`. Respect that refusal.
The revised wrapper uses a read-only cache plan and copies only package content,
indexes, local-tarball cache entries and registry metadata. It never requests
`projects`, copies a project-registration link through another transport, changes
source links or disables Docker's extraction checks. Unexpected selected symlinks
are denied. Partial prior snapshot is retained; reruns create a fresh directory.

Docker29 owner readback exposed a separate identity-gate incompatibility:
containerd reports the manifest digest as `.Id`, while classic Docker reports the
config digest. `verify-candidate-image.py` checks these independently: pinned
repository/descriptor manifest89879cc..., registry configcec5b1..., and complete
local linux/amd64 metadata with revisionf5. Empty Config/platform remains DENIED.
Owner registry config was confirmed linux/amd64/sourcef5, but the local candidate
has empty platform/config even after explicit platform pull. Do not skip that gate.
One owner-executed refresh may remove only this exact unused candidate reference,
WITHOUT force, after confirming no containers use it, then repull the same digest.
Never remove production images/containers, prune shared cache or restart Docker.
Stop if refresh is refused or metadata remains incomplete. Existing private copy
7zr3Vx is retained; no real-profile rehearsal has run as of that readback.

The runner pulls the exact published MCP digest
`sha256:89879cc358ad557dfc151f401a3f796afda7e3bc19d865c99949d9f00d302fc6`,
checks configID/sourcef5, and starts a disposable non-root container with no
network, no host ports, read-only root and no capabilities. Only the copy is
writable. It invokes the official offline installer with scripts disabled and
`web --dump-config`, never the operational launcher. It uses the already tested
preservation contract from the frozen image and checks every packaged file.
The helper accepts an absent home patch, requires installed lab4/Teams and the
exact disabled composition, and refuses unexpected state before installation.
Captured CLI/config output is never printed. A denied phase is not success.

Expected success markers:
```
PRIVATE_PROFILE_SNAPSHOT_READY /root/deepharness-stage-d-rehearsal.<suffix>
PRIVATE_PROFILE_OFFLINE_UPGRADE_MATCH
PRODUCTION_PROFILE_CONTROL_FILES_AND_WEB_UNCHANGED
```
The last marker verifies control-file hashes and containerID/start/restarts/image,
not all application data. The running application's normal writes may continue.
Copies are retained even on failure, with no automatic deletion or live mutation.
If offline dependencies/symlinks are missing, reconcile only the private copy;
never switch the rehearsal to live mounts or network just to obtain GREEN.

CI tests the helper using a copied synthetic profile with absent home patch and
the same published digest. This does not certify the actual private profile.
After a GREEN owner rehearsal, still prepare the same-stack maintenance plan,
consistent application/database backup and paired rollback before seeking the
separate approval for profile/SQL/redeploy. OAuth/ChatGPT canary remains later.
