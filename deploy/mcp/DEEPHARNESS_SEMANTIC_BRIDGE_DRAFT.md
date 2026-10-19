# DeepHarness semantic bridge draft

Status 2026-10-19: Draft engineering on top of DeepHarness PR #13; not merged, deployed, or enabled.

## Implemented in this branch

- `createDshSemanticBridge` uses the official `workspaceRegistry.get`, `sessionController.projections`, `sessionController.page`, and `sessionController.prompt` APIs.
- Team and Lead reads require exact workspace membership, a sequenced current projection, and a projection that identifies the requested session as the sole active Lead.
- Chat reads use the DSH history paging API at the projection cursor and return only text parts from durable user/assistant messages; tool arguments and other event fields are omitted.
- Instructions are text-only and queued through the official prompt API with a caller-stable UUID request id. DSH deduplicates a repeated request id within its session; the receipt means accepted into the inbox, not completed.
- The separate `/wandora/dsh-bridge/v1` route accepts only five semantic operations, is bounded to 16 KiB requests and 256 KiB responses, emits audit fields without identifiers or content, and requires an authenticated TLS peer whose SHA-256 fingerprint matches trusted operator configuration.
- The route is opt-in and remains absent unless the operator sets `semanticBridge.enabled=true` and an exact client fingerprint. This branch adds no certificate, key, grant, service account, or active runtime configuration.

## Tests

The new focused unit tests cover workspace and Lead isolation, mismatched projections, unknown fields and operations, identity/certificate pin denial, body and response bounds, content-free auditing, text-only prompt construction, and retry request-id stability.

These are adapter and handler tests with official service-shaped fixtures. They do not establish DSH session persistence, agent response completion, a working Remote-Ops network client, or production readiness.

## Remaining gates

- Wire the Remote-Ops semantic tools to this endpoint using a fixed mTLS client and the existing persistent grant/idempotency gate.
- Add disposable-host tests that admit a message through the real DSH SessionController, restart/reopen the session, and verify the durable human message and subsequent Lead response.
- Reconcile the dependency on DSH PR #13 and the read package artifact/version; do not merge this branch independently of its required runtime source.
- Prepare separately reviewed certificate provisioning and runtime enablement, then a lab-only canary. No production Lead message is authorized by this draft.

## Rollback

The bridge defaults off. Rollback is to remove the `semanticBridge` operator setting and revert this source change. No persistent schema, existing profile data, Docker privileges, OAuth client, or production target configuration is changed.
