/**
 * Official DSH 0.2.1-alpha.2 package surface preflight.
 * This is NOT the full Cordis+HTTP integration test: that gate additionally
 * needs a pinned npm lockfile, initialized services and real SDK dispatch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
import { TeamService } from '@deepseek-ai/dsh-experimental-agent-team';

test('official published DSH host packages expose read service contracts', () => {
  assert.equal(typeof SessionStore.prototype.get, 'function');
  assert.equal(typeof SessionProjectionRegistry.prototype.snapshot, 'function');
  assert.equal(typeof WorkspaceRegistry.prototype.get, 'function');
  assert.equal(typeof TeamService, 'function');
  assert.ok(Array.isArray(TeamService.inject));
  assert.ok(TeamService.inject.includes('sessionProjections'));
});
