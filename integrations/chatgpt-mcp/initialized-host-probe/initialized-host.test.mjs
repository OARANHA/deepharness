import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace';
import TeamService from '@deepseek-ai/dsh-experimental-agent-team';

test('official initialized-host prerequisite contracts are present', async t => {
  const ctx = new Context();
  t.after(async () => { await ctx.fiber.dispose(); });
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  const session = ctx.sessions.create('host-probe-lead');
  assert.equal(ctx.sessions.get(session.id), session);
  assert.equal(typeof ctx.sessionProjections.snapshot, 'function');
  assert.deepEqual(WorkspaceRegistry.inject, ['storageDomain', 'sessionPersistence']);
  for (const service of ['agents', 'sessions', 'sessionPersistence', 'sessionProjections', 'subagents']) {
    assert.ok(TeamService.inject.includes(service));
  }
});

test('official WorkspaceRegistry and JSONL persistence initialize on disposable JSON domain', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Storage } = await import('@deepseek-ai/dsh-storage');
  const { apply: storageJson } = await import('@deepseek-ai/dsh-storage-json');
  const { DomainFacility } = await import('@deepseek-ai/dsh-storage-domain');
  const { default: JsonlSessionPersistence } = await import('@deepseek-ai/dsh-session-persistence-jsonl');
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-host-'));
  const ctx = new Context();
  t.after(async () => {
    try { await ctx.fiber.dispose(); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
  await ctx.plugin(Storage);
  storageJson(ctx, { root: join(root, 'storage') });
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} });
  ctx.storage.mount('domain', facility);
  ctx.provide('storageDomain', facility);
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' });
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(WorkspaceRegistry);
  // No agent/model is launched: provide inert read-only dependencies required
  // by TeamService's declared DI contract, without enabling mutations.
  ctx.provide('agents', { list: () => [] });
  ctx.provide('subagents', {});
  await ctx.plugin(TeamService);
  assert.equal(typeof ctx.workspaceRegistry.get, 'function');
  assert.equal(typeof ctx.agentTeams.membership, 'function');
  assert.equal(typeof ctx.sessionPersistence.list, 'function');
  const lead = ctx.sessions.create('official-host-lead');
  assert.equal(ctx.sessions.get(lead.id), lead);
  const snapshot = ctx.sessionProjections.snapshot(lead, ['agentTeam']);
  assert.ok(snapshot.values.agentTeam, 'TeamService must register the official agentTeam projection');
  assert.deepEqual(snapshot.values.agentTeam.members, [
    { id: lead.id, name: 'lead', role: 'lead', phase: 'active' },
  ]);
  assert.deepEqual(snapshot.values.agentTeam.tasks, []);
});
