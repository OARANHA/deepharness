import { projectionFixture } from '../test/projection-fixture.mjs';
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
import { registerScopedTeamReadTool } from '../adapters/register-scoped-team-read-tool.mjs';

test('official DSH read service signatures with real SDK HTTP binding and negative scope', { timeout: 15000 }, async t => {
  let token = randomBytes(32).toString('base64url');
  let reads = 0;
  let release, entered;
  let pending;
  assert.equal(typeof SessionStore.prototype.get, 'function');
  assert.equal(typeof SessionProjectionRegistry.prototype.snapshot, 'function');
  assert.equal(typeof WorkspaceRegistry.prototype.get, 'function');
  const lead = { id: 'lead' };
  const host = {
    sessions: { get: id => id === lead.id ? lead : undefined },
    workspaceRegistry: { get: id => id === 'ws' ? { id: 'ws', sessionIds: ['lead'] } : undefined },
    sessionProjections: projectionFixture({ read: (session, keys) => {
      assert.equal(session, lead);
      assert.deepEqual(keys, ['agentTeam']);
      reads++;
      if (pending) { entered(); return pending; }
      return { members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] };
    } }),
  };
  const binding = createDshHostReadBinding(host, {
    currentCredential: () => ({ authMode: 'token', authToken: token, principalId: 'bridge' }),
    grants: [{ principalId: 'bridge', workspaceId: 'ws', leadSessionId: 'lead' }],
    allowedOrigins: ['https://client.example'],

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
  const target = { workspaceId: 'ws', leadSessionId: 'lead' };
  const allowed = await (await call(target)).json();
  assert.equal(allowed.result.isError, undefined);
  assert.equal(JSON.parse(allowed.result.content[0].text).leadSessionId, 'lead');
  assert.equal(reads, 1);
  for (const args of [
    { ...target, workspaceId: 'other' },
    { ...target, leadSessionId: 'other' },
    { ...target, principalId: 'bridge' },
  ]) {
    const denied = await (await call(args)).json();
    assert.equal(denied.result?.isError === true || !!denied.error, true);
  }
  assert.equal(reads, 1);
  for (const headers of [{ authorization: 'Bearer invalid' }, { origin: 'https://evil.example' }, { authorization: '' }]) {
    const denied = await send('tools/call', { name: 'dsh_read_agent_team', arguments: target }, headers);
    assert.equal(denied.status, 403); await denied.text();
  }
  assert.equal(reads, 1);
  pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const running = call(target);
  await started;
  binding.revokeGrant({ principalId: 'bridge', ...target });
  release({ members: [{ id: 'lead', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] });
  const revoked = await (await running).json();
  assert.equal(revoked.result.isError, true);
  assert.equal(revoked.result.content[0].text.includes('members'), false);
  const old = token;
  token = randomBytes(32).toString('base64url');
  const rotated = await send('tools/list', {}, { authorization: 'Bearer ' + old });
  assert.equal(rotated.status, 403); await rotated.text();
});
