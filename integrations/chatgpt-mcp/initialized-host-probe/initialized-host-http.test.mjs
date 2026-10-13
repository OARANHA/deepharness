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
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createDshHostReadBinding } from '../adapters/dsh-host-read-binding.mjs';
import { createDshAgentTeamHostReader } from '../adapters/dsh-agent-teams-host-reader.mjs';
import { projectAgentTeam } from '../adapters/agent-teams-read-model.mjs';
import { registerScopedTeamReadTool } from '../adapters/register-scoped-team-read-tool.mjs';

test('initialized official TeamService WorkspaceRegistry JSONL host through SDK HTTP', { timeout: 15000 }, async t => {
  let token = randomBytes(32).toString('base64url');
  assert.equal(typeof SessionStore.prototype.get, 'function');
  assert.equal(typeof SessionProjectionRegistry.prototype.snapshot, 'function');
  assert.equal(typeof WorkspaceRegistry.prototype.get, 'function');
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-official-e2e-'));
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
  const lead = ctx.sessions.create('lead', { meta: { cwd: root } });
  await ctx.plugin(WorkspaceRegistry);
  ctx.provide('agents', { list: () => [] });
  ctx.provide('subagents', {});
  await ctx.plugin(TeamService);
  const workspace = await ctx.workspaceRegistry.create(root);
  await workspace.attachSession(lead.id);
  assert.ok(ctx.workspaceRegistry.get(workspace.id)?.sessionIds.includes(lead.id),
    'official workspace must durably attach the Lead after cwd validation');
  assert.equal(ctx.sessions.get(lead.id), lead);
  const realProjection = ctx.sessionProjections.snapshot(lead, ['agentTeam']).values.agentTeam;
  assert.deepEqual(realProjection.members, [{ id: lead.id, name: 'lead', role: 'lead', phase: 'active' }]);
  // Probe the official data shape separately from MCP authentication.
  assert.equal(ctx.workspaceRegistry.get(workspace.id), workspace);
  assert.deepEqual([...workspace.sessionIds], [lead.id]);
  assert.equal(ctx.sessions.get(lead.id), lead);
  assert.equal(typeof realProjection.failure, 'undefined');
  assert.equal(projectAgentTeam(lead.id, realProjection).leadSessionId, lead.id);
  // Isolate official DSH workspace/projection adapter from HTTP/Bearer transport.
  // This is a test-only explicit principal and exact-scope grant, not a
  // substitute for the separately exercised transport authorization.
  const directReader = createDshAgentTeamHostReader({
    workspaceRegistry: ctx.workspaceRegistry,
    sessionProjections: ctx.sessionProjections,
    resolveLiveLeadSession: async id => ctx.sessions.get(id),
    principalFromTransport: async () => 'bridge',
    authorizePrincipal: async scope => scope.principalId === 'bridge'
      && scope.workspaceId === workspace.id && scope.leadSessionId === lead.id,
  });
  const direct = await directReader({ workspaceId: workspace.id, leadSessionId: lead.id });
  assert.equal(direct.leadSessionId, lead.id,
    'stage: official workspace+projection reader must work before Bearer transport');
  const host = ctx;
  const binding = createDshHostReadBinding(host, {
    currentCredential: () => ({ authMode: 'token', authToken: token, principalId: 'bridge' }),
    grants: [{ principalId: 'bridge', workspaceId: workspace.id, leadSessionId: lead.id }],
    allowedOrigins: ['https://client.example'],

  });
  // A real request-scoped HTTP binding, exercised before SDK dispatch.
  // This tests the auth/host-binding boundary without accepting MCP claims.
  await binding.runHttpRequest({ headers: {
    authorization: 'Bearer ' + token,
    origin: 'https://client.example',
  } }, async () => {
    const scoped = await binding.readTeam({ workspaceId: workspace.id, leadSessionId: lead.id });
    assert.equal(scoped.leadSessionId, lead.id,
      'stage: authenticated host binding must read Team before SDK transport');
  });
  const sessions = new Map();
  const http = createServer(async (req, res) => {
    try {
      await binding.runHttpRequest(req, async () => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        let entry = sessions.get(req.headers['mcp-session-id']);
        if (!entry) {
          if (req.headers['mcp-session-id']) { res.writeHead(404).end(); return; }
          const server = new McpServer({ name: 'scoped-test', version: '1.0.0' });
          registerScopedTeamReadTool(server, binding, z.object({
            workspaceId: z.string().min(1).max(256),
            leadSessionId: z.string().min(1).max(256),
          }).strict());
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(), enableJsonResponse: true,
            onsessioninitialized: id => sessions.set(id, { server, transport }),
          });
          entry = { server, transport };
          await server.connect(transport);
        }
        await entry.transport.handleRequest(req, res, body);
      });
    } catch {
      if (!res.headersSent) res.writeHead(403).end('denied');
      else res.destroy();
    }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const { server, transport } of sessions.values()) { await transport.close(); await server.close(); }
    await new Promise(resolve => { http.close(resolve); http.closeAllConnections(); });
  });
  const url = 'http://127.0.0.1:' + http.address().port + '/mcp';
  let session;
  let id = 1;
  const send = async (method, params, overrides = {}) => fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      authorization: 'Bearer ' + token, origin: 'https://client.example',
      ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-03-26' } : {}),
      ...overrides,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const initialized = await send('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(initialized.status, 200);
  session = initialized.headers.get('mcp-session-id');
  assert.ok(session);
  await initialized.json();
  const listed = await (await send('tools/list', {})).json();
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['dsh_read_agent_team']);
  const call = args => send('tools/call', { name: 'dsh_read_agent_team', arguments: args });
  const target = { workspaceId: workspace.id, leadSessionId: lead.id };
  const allowed = await (await call(target)).json();
  assert.equal(allowed.result.isError, undefined,
    `official host rejected authorized read: ${JSON.stringify(allowed.result.content)}`);
  assert.equal(JSON.parse(allowed.result.content[0].text).leadSessionId, 'lead');
  assert.deepEqual(ctx.sessionProjections.snapshot(lead, ['agentTeam']).values.agentTeam, realProjection);
  for (const args of [
    { ...target, workspaceId: 'other' },
    { ...target, leadSessionId: 'other' },
    { ...target, principalId: 'bridge' },
  ]) {
    const denied = await (await call(args)).json();
    assert.equal(denied.result?.isError === true || !!denied.error, true);
  }
  for (const headers of [{ authorization: 'Bearer invalid' }, { origin: 'https://evil.example' }, { authorization: '' }]) {
    const denied = await send('tools/call', { name: 'dsh_read_agent_team', arguments: target }, headers);
    assert.equal(denied.status, 403); await denied.text();
  }
  binding.revokeGrant({ principalId: 'bridge', ...target });
  const revoked = await (await call(target)).json();
  assert.equal(revoked.result.isError, true);
  assert.equal(revoked.result.content[0].text.includes('members'), false);
  const old = token;
  token = randomBytes(32).toString('base64url');
  const rotated = await send('tools/list', {}, { authorization: 'Bearer ' + old });
  assert.equal(rotated.status, 403); await rotated.text();
});
