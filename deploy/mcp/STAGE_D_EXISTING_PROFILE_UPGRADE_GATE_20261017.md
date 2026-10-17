# Existing-profile and deadline upgrade gate — review only

Owner diagnostic, 2026-10-17, root@28server: package0.1.0-lab.4,
AgentTeams selected, runtimeEnabled=true; reader role on primary,
statement_timeout1500ms, default and transaction read-only=on.
These are owner-provided readbacks, not assistant-executed container commands.
The same target's safe inspect independently confirmed old Web/grants digests,
stack90, unchanged named volumes and zero restarts. Agent connection recovered.

The source integration at36c83c1e passed CI39003300091/39003300093. This follow-up
adds only review/test preparation. Do not substitute a new untested candidate.

## Official existing-package upgrade proof

`existing-profile-upgrade-ci.mjs` is CI-ONLY: requires explicit fixture flag,
UID1000, and a temporary home under `/fixture/stage-d-upgrade-*`. It cannot target
`/data/dsh`. It has no production mode, live-profile backup or deployment command.
The candidate retains the legacy lab4tarball from its immutable parent for tests.

Workflow uses an empty disposable runner directory. First container can resolve
public fixture dependencies; it installs the official Teams bundle and legacy
lab4package through the official CLI without scripts. Second container has
`--network none` and upgrades the existing dependency through the same official
CLI with `--offline --ignore-scripts`. Neither invokes Web startup or a model;
`web --dump-config` only materializes the composition for comparisons.

The pure contract requires exactly one existing connector bundle, exact lab4→lab5,
unchanged ordered bundle list, unrelated dependencies and metadata, both patches,
entire disabled composition, and unrelated lock importer/package/snapshot entries.
The only ignored lock entries are the connector's own old/new tarball references.
Installed lab5files must match the candidate per-file manifest.

This fixture validates the mechanism, not the actual custom profile's JEV cache,
lock/store layout or selected third-party bundles. A future approved preparation
must back up and rehearse against a private clone of the actual profile with the
SAME checks, before changing the live profile. Never rerun the first-install helper.
No production installer is claimed ready by this CI-only script.

## Existing database deadline migration

The `.review.sql` pair is deliberately NOT copied into initdb.d and never run by
normal startup. It requires separate owner approval and the actual DB owner.
Migration refuses wrong DB/replica, missing/privileged reader, a changed global
1500ms role baseline, or any preexisting database-specific timeout override.
It sets only `dsh_mcp_reader IN DATABASE dsh_mcp_grants` to750ms. It does not change
the global role setting, grants, table data, secrets, passwords or other databases.
New checkouts are required to observe it; existing pool sessions do not inherit it.

Paired rollback verifies the still-matching global baseline and exact750ms override,
then RESETs only that override, restoring inherited1500ms. It refuses unmatched
rollback state. If the real baseline differs, stop and reconcile instead of editing
the SQL to force acceptance. Snapshot prior relevant settings before an approved apply.

Disposable PostgreSQL test exercises apply, repeated-apply rejection, fresh reader
passing750ms authority gate, unchanged global role/grants, rollback, fresh denial1500ms,
and rejection of a second rollback. It also retains SQLSTATE57014/read-only tests.

## Operational fence

No merge, publication, profile mutation, production SQL, stop/restart/redeploy,
Keycloak/grant/token change, listener or ChatGPT login occurred here.
The Web must be stopped through an owner-approved same-stack window BEFORE any
future actual profile update; never start a second Web on the live volumes.
Freeze and verify the final CI/artifact after this follow-up, then prepare a precise
publication + backup/clone rehearsal approval. OAuth/public canary remains later.
