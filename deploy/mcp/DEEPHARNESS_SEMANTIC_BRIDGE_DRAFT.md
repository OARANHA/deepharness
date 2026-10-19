# DeepHarness semantic bridge draft

Status 2026-10-19: Draft engineering on top of DeepHarness PR #13; not merged, deployed, or enabled.

The bridge package is `0.1.0-lab.7`. The operational image loads both bridge
factories through explicit installed-package exports; no copied launcher imports
adapter source by a repository-relative path. The disposable PostgreSQL probe
supplies the API-shaped SessionController fixture required by this host. At
head `0f09add5c64d3b83fe0ad4683427d374d6d2cf7c`, Bootstrap #476 failed during
Dockerfile npm install after requesting a missing
`@aws-sdk/credential-provider-http-3.972.77.tgz` (HTTP 404); addon, Web/ingress
smokes, stack validation and GHCR publication were skipped. On its parent head,
Bootstrap #475 first failed resolving `@aws-sdk/core@^3.978.4`; the failed-job
retry then failed resolving `@aws-sdk/credential-provider-http@^3.972.77`.
No image was published. Stage D #19 passed both PostgreSQL authorization/
revocation and candidate build/upload. On the current documentation head, Stage
D #20 has passed `pg-primary`; `candidate` is still running at last check.
The profile-preservation verifier reads the exact package version from the
packed artifact manifest. The package was not deployed or enabled.

## Implemented in this branch

- `createDshSemanticBridge` uses the official `workspaceRegistry.get`, `sessionController.projections`, `sessionController.page`, and `sessionController.prompt` APIs.
- Team and Lead reads require exact workspace membership, a sequenced current projection, and a projection that identifies the requested session as the sole active Lead.
- Chat reads use the DSH history paging API at the projection cursor and return only text parts from durable user/assistant messages; tool arguments and other event fields are omitted.
- Instructions are text-only and queued through the official prompt API with a caller-stable UUID request id. DSH deduplicates a repeated request id within its session; the receipt means accepted into the inbox, not completed.
- The separate `/wandora/dsh-bridge/v1` route accepts only five semantic operations, is bounded to 16 KiB requests and 256 KiB responses, emits audit fields without identifiers or content, and requires an authenticated TLS peer whose SHA-256 fingerprint matches trusted operator configuration.
- The route is opt-in and remains absent unless the operator sets `semanticBridge.enabled=true` and an exact client fingerprint. This branch adds no certificate, key, grant, service account, or active runtime configuration.

## Tests

Focused tests cover workspace and Lead isolation, mismatched projections,
unknown fields and operations, identity/certificate pin denial, body and
response bounds, content-free auditing, text-only prompt construction, and
retry request-id stability. The handler now also has an isolated HTTPS test
using ephemeral CA/server/client certificates: the pinned mTLS peer succeeds,
another CA-trusted but unpinned peer is denied before bridge dispatch, and
audits contain no message text or Lead identifier. The full package suite
passes **75/75** locally; focused existing-host/upgrade tests pass **20/20**.

The HTTPS test exercises the real DSH handler over a local TLS socket, but its
bridge service remains a fixture. It does not establish actual DSH Session
persistence, agent response completion, the production private route, or
production readiness.

Bootstrap remains RED across three install attempts, with two distinct ETARGET
dependency-resolution failures and one npm 404 for an AWS SDK tarball in the
pinned `@deepseek-ai/dsh@0.2.1-alpha.2` install. The evidence does not justify
a dependency override; resolve the published-runtime/package inconsistency
through a reviewed and reproducible dependency update, then rerun the full
bootstrap gate.

## Remaining gates

- The corresponding Remote-Ops tools and fixed mTLS client are implemented in Draft PR #71; neither PR is merged or live.
- Add disposable-host tests that admit a message through the real DSH SessionController, restart/reopen the session, and verify the durable human message and subsequent Lead response.
- Create a separately reviewed, non-self-service path to provision and revoke exact client/session/workspace/Lead/action grants.
- Reconcile the dependency stack: DSH PRs #8–#13 are open Draft and unmerged; PR #17 must not be merged independently. Publish/verify the `lab.7` artifact before runtime image construction.
- Prepare separately reviewed certificate provisioning and runtime enablement, then a lab-only canary. No production Lead message is authorized by this draft.

## Rollback

The bridge defaults off. Rollback is to remove the `semanticBridge` operator setting and revert this source change. No persistent schema, existing profile data, Docker privileges, OAuth client, or production target configuration is changed.
