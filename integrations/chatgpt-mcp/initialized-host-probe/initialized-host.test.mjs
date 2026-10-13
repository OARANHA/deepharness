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
