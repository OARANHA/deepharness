import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAgentTeam } from '../adapters/agent-teams-read-model.mjs';

const sample = () => ({
  members: [
    { id: 'lead-1', name: 'Lead', role: 'lead', phase: 'active' },
    { id: 'member-1', name: 'Research', role: 'teammate', phase: 'active' },
  ],
  tasks: [{ id: 'task-1', revision: 2, subject: 'Inspect', description: 'Review scope',
    status: 'in_progress', blockedBy: [], writeScopes: ['src/'],
    ownerName: 'Research', ready: true, writeScopeWarnings: [] }],
});

test('projects a detached, strictly bounded read model', () => {
  const original = sample();
  const value = projectAgentTeam('lead-1', original);
  assert.equal(value.members.length, 2);
  assert.equal(value.tasks[0].revision, 2);
  original.tasks[0].writeScopes.push('outside/');
  assert.deepEqual(value.tasks[0].writeScopes, ['src/']);
  assert.equal('prompt' in value.members[0], false);
});

test('rejects wrong Lead, malformed phases and missing records', () => {
  assert.throws(() => projectAgentTeam('other', sample()), /requested Lead/);
  assert.throws(() => projectAgentTeam('lead-1', {}), /invalid Agent Teams/);
  const invalid = sample();
  invalid.members[1].phase = 'deleted';
  assert.throws(() => projectAgentTeam('lead-1', invalid), /invalid member.phase/);
});

test('fails closed on replay failure and unknown task status', () => {
  assert.throws(() => projectAgentTeam('lead-1', { ...sample(), failure: 'corrupt event' }), /replay failure/);
  const deleted = sample();
  deleted.tasks[0].status = 'deleted';
  assert.throws(() => projectAgentTeam('lead-1', deleted), /invalid task.status/);
});

test('rejects duplicate members, extra Leads and inconsistent Lead phase', () => {
  const duplicated = sample();
  duplicated.members.push({ ...duplicated.members[1] });
  assert.throws(() => projectAgentTeam('lead-1', duplicated), /duplicate Team member id/);
  const extraLead = sample();
  extraLead.members[1].role = 'lead';
  assert.throws(() => projectAgentTeam('lead-1', extraLead), /requested Lead/);
  const inactiveLead = sample();
  inactiveLead.members[0].phase = 'failed';
  assert.throws(() => projectAgentTeam('lead-1', inactiveLead), /requested Lead/);
});

test('rejects ambiguous tasks and invalid dependency references', () => {
  const duplicated = sample();
  duplicated.tasks.push({ ...duplicated.tasks[0] });
  assert.throws(() => projectAgentTeam('lead-1', duplicated), /duplicate Team task id/);
  for (const blockedBy of [['task-1'], ['absent-task'], ['absent-task', 'absent-task']]) {
    const invalid = sample();
    invalid.tasks[0].blockedBy = blockedBy;
    assert.throws(() => projectAgentTeam('lead-1', invalid), /invalid Team task dependency/);
  }
  const valid = sample();
  valid.tasks.push({ ...valid.tasks[0], id: 'task-2', blockedBy: ['task-1'] });
  assert.equal(projectAgentTeam('lead-1', valid).tasks.length, 2);
});
