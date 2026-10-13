import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAgentTeamReadAuthorized, readAuthorizedAgentTeam } from '../adapters/agent-teams-read-authorization.mjs';

const request = { leadSessionId: 'lead-1' };
const allowed = () => ({
  authenticatedPrincipalId: 'owner',
  authorizedPrincipalId: 'owner',
  workspaceId: 'work-1',
  sessionWorkspaceId: 'work-1',
  authorizedLeadSessionId: 'lead-1',
  canReadTeamProjection: true,
});
const projection = () => ({
  members: [{ id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' }],
  tasks: [],
});

test('permits exact trusted principal, workspace and Lead match', async () => {
  let readCount = 0;
  const result = await readAuthorizedAgentTeam(request, {
    resolveAuthority: async () => allowed(),
    readProjection: async () => { readCount++; return projection(); },
  });
  assert.equal(result.leadSessionId, 'lead-1');
  assert.equal(readCount, 1);
});

test('rejects missing, mismatched or self-asserted authority', () => {
  for (const patch of [
    { authenticatedPrincipalId: '' },
    { authenticatedPrincipalId: 'intruder' },
    { workspaceId: 'other' },
    { sessionWorkspaceId: '' },
    { authorizedLeadSessionId: 'other' },
    { canReadTeamProjection: false },
    { canReadTeamProjection: 'true' },
  ]) {
    assert.throws(() => assertAgentTeamReadAuthorized(request, { ...allowed(), ...patch }), /read denied/);
  }
  assert.throws(() => assertAgentTeamReadAuthorized({ leadSessionId: 'other' }, allowed()), /read denied/);
  assert.throws(() => assertAgentTeamReadAuthorized({}, allowed()), /read denied/);
});

test('never fetches projection before authorization', async () => {
  let fetched = false;
  await assert.rejects(
    readAuthorizedAgentTeam(request, {
      resolveAuthority: async () => ({ ...allowed(), sessionWorkspaceId: 'other' }),
      readProjection: async () => { fetched = true; return projection(); },
    }),
    /read denied/,
  );
  assert.equal(fetched, false);
});

test('requires host provider and rejects malformed projection', async () => {
  await assert.rejects(readAuthorizedAgentTeam(request, {}), /read denied/);
  await assert.rejects(readAuthorizedAgentTeam(request, {
    resolveAuthority: async () => allowed(),
    readProjection: async () => ({ members: [], tasks: [] }),
  }), /requested Lead/);
});
