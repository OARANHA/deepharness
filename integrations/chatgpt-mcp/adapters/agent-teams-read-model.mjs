/**
 * Read-only, detached projection of an existing Agent Teams Lead Session.
 * This module has no MCP transport, authorization decision, or write operation.
 * The caller MUST authorize the exact Lead session before passing its data.
 */
const MAX_MEMBERS = 128;
const MAX_TASKS = 512;

function record(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function str(v, name) {
  if (typeof v !== 'string') throw new TypeError(`invalid ${name}`);
  return v;
}
function choice(v, values, name) {
  if (!values.includes(v)) throw new TypeError(`invalid ${name}`);
  return v;
}
function strings(v, name) {
  if (!Array.isArray(v) || v.length > 512) throw new TypeError(`invalid ${name}`);
  return v.map((x, i) => str(x, `${name}[${i}]`));
}
function member(m) {
  if (!record(m)) throw new TypeError('invalid member');
  return {
    id: str(m.id, 'member.id'),
    name: str(m.name, 'member.name'),
    role: choice(m.role, ['lead', 'teammate'], 'member.role'),
    phase: choice(m.phase, ['provisioning', 'active', 'failed'], 'member.phase'),
    ...(m.error === undefined ? {} : { error: str(m.error, 'member.error') }),
  };
}
function task(t) {
  if (!record(t)) throw new TypeError('invalid task');
  if (!Number.isSafeInteger(t.revision) || t.revision < 1) throw new TypeError('invalid task.revision');
  if (typeof t.ready !== 'boolean') throw new TypeError('invalid task.ready');
  return {
    id: str(t.id, 'task.id'),
    revision: t.revision,
    subject: str(t.subject, 'task.subject'),
    description: str(t.description, 'task.description'),
    status: choice(t.status, ['pending', 'in_progress', 'completed'], 'task.status'),
    blockedBy: strings(t.blockedBy, 'task.blockedBy'),
    writeScopes: strings(t.writeScopes, 'task.writeScopes'),
    ...(t.ownerName === undefined ? {} : { ownerName: str(t.ownerName, 'task.ownerName') }),
    ready: t.ready,
    writeScopeWarnings: strings(t.writeScopeWarnings, 'task.writeScopeWarnings'),
  };
}
export function projectAgentTeam(leadSessionId, projection) {
  const id = str(leadSessionId, 'leadSessionId');
  if (!id) throw new TypeError('empty Lead id');
  if (!record(projection) || !Array.isArray(projection.members) ||
      !Array.isArray(projection.tasks) ||
      projection.members.length > MAX_MEMBERS || projection.tasks.length > MAX_TASKS) {
    throw new TypeError('invalid Agent Teams projection');
  }
  if (projection.failure !== undefined) {
    // Rejected persisted Team data must not silently appear as current.
    throw new Error('Agent Teams projection reports a replay failure');
  }
  const members = projection.members.map(member);
  if (members.filter(m => m.role === 'lead' && m.id === id).length !== 1) {
    throw new TypeError('projection does not identify the requested Lead');
  }
  return {
    leadSessionId: id,
    members,
    tasks: projection.tasks.map(task),
  };
}
