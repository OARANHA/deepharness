/** Isolated Keycloak probe helper; only disposable official DSH data.
 * Receives the in-memory real JWT request and existing verifier, never logs them.
 * No HTTP listener, persisted credentials, agent execution or production host.
 */
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Storage from '@deepseek-ai/dsh-storage';
import { apply as storageJson } from '@deepseek-ai/dsh-storage-json';
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import TeamService from '@deepseek-ai/dsh-experimental-agent-team';
import { SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
import { prepareOfficialDshTeamRead } from '../adapters/prepare-official-dsh-team-read.mjs';

export async function probeKeycloakOfficialHost({ authenticateTransport, request, principal, revoke }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-keycloak-official-'));
  const ctx = new Context();
  try {
    await ctx.plugin(Storage);
    storageJson(ctx, { root: join(root, 'storage') });
    const facility = new DomainFacility(ctx, { backend: 'json', routes: {} });
    ctx.storage.mount('domain', facility);
    ctx.provide('storageDomain', facility);
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' });
    await ctx.plugin(SessionStore);
    await ctx.plugin(SessionProjectionRegistry);
    const lead = ctx.sessions.create('keycloak-official-lead', { meta: { cwd: root } });
    const other = ctx.sessions.create('keycloak-official-other-lead', { meta: { cwd: root } });
    await ctx.plugin(WorkspaceRegistry);
    // Inert prerequisites only: no agent/model execution.
    ctx.provide('agents', { list: () => [] });
    ctx.provide('subagents', {});
    await ctx.plugin(TeamService);
    const workspaceRegistry = ctx.workspaceRegistry;
    const sessions = ctx.sessions;
    const projections = ctx.sessionProjections;
    const workspace = await workspaceRegistry.create(root);
    await workspace.attachSession(lead.id);
    await workspace.attachSession(other.id);
    const before = projections.snapshot(lead, ['agentTeam']).values.agentTeam;
    assert.deepEqual(before.members, [{ id: lead.id, name: 'lead', role: 'lead', phase: 'active' }]);
    const identity = await authenticateTransport(request);
    assert.equal(identity.kind, 'individual');
    assert.equal(identity.principalId, principal);
    let reads = 0;
    let revokeDuringResolution = false;
    const binding = prepareOfficialDshTeamRead({
      workspaceRegistry,
      sessionProjections: { snapshot(session, keys) {
        reads++;
        return projections.snapshot(session, keys);
      } },
      resolveLiveLeadSession: async id => {
        const session = sessions.get(id);
        if (revokeDuringResolution) await revoke();
        return session;
      },
      authenticateTransport,
      grants: [{ principalId: principal, workspaceId: workspace.id, leadSessionId: lead.id }],
      allowedOrigins: ['http://127.0.0.1:18081'],
    });
    const target = { workspaceId: workspace.id, leadSessionId: lead.id };
    const read = (args = target, req = request) => binding.runHttpRequest(req, () => binding.readTeam(args));
    const allowed = await read();
    assert.equal(allowed.leadSessionId, lead.id);
    assert.deepEqual(allowed.members, before.members);
    assert.deepEqual(allowed.tasks, before.tasks);
    const afterAllowed = reads;
    await assert.rejects(read({ ...target, leadSessionId: other.id }), /denied/);
    await assert.rejects(read({ ...target, leadSessionId: other.id, principalId: principal }), /denied/);
    await assert.rejects(read({ ...target, workspaceId: 'ungranted-workspace' }), /denied/);
    await assert.rejects(read(target, { headers: {
      authorization: 'Bearer invalid', origin: 'http://127.0.0.1:18081',
    } }), /denied/);
    assert.equal(reads, afterAllowed, 'denied requests must not access official projection');
    // Same real bearer becomes revoked across an awaited live-session lookup.
    revokeDuringResolution = true;
    await assert.rejects(read(), /denied/);
    assert.equal(reads, afterAllowed, 'in-flight revocation must deny before projection');
    await assert.rejects(read(), /denied/);
    assert.deepEqual(projections.snapshot(lead, ['agentTeam']).values.agentTeam, before);
    assert.equal(sessions.get(lead.id), lead);
    assert.equal(sessions.get(other.id), other);
    console.log('KEYCLOAK_HUMAN_OFFICIAL_DSH_READ_MATCH: real issuer JWT + individual grants + official projection + other Lead denied + in-flight revocation');
  } finally {
    try { await ctx.fiber.dispose(); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
}
