# Packaged runtime contract

Private package; not published to npm. Exports runtime, Cordis plugin, persistent
policy, package metadata and `./pg-read-query`. Requires an already initialized
official DSH0.2.1-alpha.2 host; optional peer declarations do not bootstrap services.
No package scripts create servers, grants, agents, workspaces or sessions.

`npm pack --ignore-scripts` includes only the explicit `files` list. Integration
tests install the tarball offline, compare every entry with source, import every
packaged module and resolve all exports. CI candidates include per-file hashes,
tarball checksum, exact source head/tree and saved image identities.

A volume-backed Web profile is not updated by building an image. The opt-in
launcher verifies its installed package against the candidate manifest BEFORE
imports, and rejects old or modified files. Package upgrades and the role migration
from historical1500ms to750ms need a separately reviewed owner-approved gate.

Read backend accepts only exact hash-parameterized grant/revocation SELECTs. It
never exposes a revocation INSERT method. Default bundle/endpoint are disabled;
this package is not an operational ChatGPT connection or deployment authorization.

The lab.6 source additionally contains a separate internal semantic bridge
adapter and fixed mTLS HTTP handler. The existing OAuth MCP route remains
read-only; the semantic route is disabled unless a trusted operator config
pins one client certificate fingerprint. The route accepts only Team listing,
Team status/tasks, bounded text chat, and queued text instruction operations.
It is not yet wired to the Remote-Ops caller, grants, or client certificate, and
has not been deployed or tested against a live DSH session.
