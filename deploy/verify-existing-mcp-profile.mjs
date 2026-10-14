/** CI only: installed package mounted on the official booted Web profile. */
import './verify-disabled-mcp-profile.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {bootExistingProfileReadHost} from './mcp/existing-profile-host.mjs';
const official=createRequire('/opt/dsh/node_modules/@deepseek-ai/dsh/package.json');
const {runProfile}=await import(pathToFileURL(official.resolve('@deepseek-ai/dsh/profile-boot')).href);
const {loadLayeredEnv}=await import(pathToFileURL(official.resolve('@deepseek-ai/dsh-app-boot')).href);
const installed=createRequire('/data/dsh/profiles/web/package.json');
const plugin=await import(pathToFileURL(installed.resolve('@wandora/deepharness-chatgpt-mcp-read/plugin')).href);
const {createPersistentDshMcpReadPolicy}=await import(pathToFileURL(installed.resolve('@wandora/deepharness-chatgpt-mcp-read/policy')).href);
let host,phase='official Web profile boot';
try {
  host=await bootExistingProfileReadHost({
    runProfile,environment:loadLayeredEnv('dsh'),
    args:['--no-open','--port','3080','--host','127.0.0.1'],plugin,
    createPolicy:async ctx=>{
      // Snapshot real initialized service handles: no replacement or fixture host.
      assert.ok(ctx.workspaceRegistry&&ctx.sessions&&ctx.sessionProjections);
      return createPersistentDshMcpReadPolicy({
        issuer:'https://identity.example/realms/lab',resource:'https://mcp.example/mcp',
        allowedOrigins:['https://client.example'],
        discovery:{get:async()=>{throw Error('CI must not request external identity');}},
        query:async()=>{throw Error('CI must not query a production primary');},
        allowMissingNotBefore:true,
      });
    },
  });
  phase='existing Web authorization fence';
  assert.equal((await fetch('http://127.0.0.1:3080/api/',{redirect:'error'})).status,401);
  phase='read service and closed transport';
  assert.equal(host.ctx.get('chatgptMcpRead'),host.service);
  assert.equal(typeof host.service.readTeam,'function');
  assert.equal(typeof host.service.createPrivateTransport,'function');
  await assert.rejects(host.service.readTeam({workspaceId:'ungranted',leadSessionId:'ungranted'}));
  const service=host.service;
  phase='root disposal invalidates connector';
  await host.ctx.fiber.dispose();host=undefined;
  await assert.rejects(service.readTeam({workspaceId:'ungranted',leadSessionId:'ungranted'}));
  assert.throws(()=>service.createPrivateTransport({enabled:true}));
  console.log('DSH_EXISTING_WEB_PROFILE_READ_SERVICE_MATCH: actual official launcher + installed package + existing services + Web 401 + denied ungranted read + disposal; no MCP listener');
} catch(error) {
  const safe=/^Existing DSH read host composition denied \([a-z-]+\)$/.test(error?.message??'')?error.message:'internal';
  throw Error('Existing official Web composition proof failed at '+phase+' ('+safe+')');
} finally {
  await host?.ctx.fiber.dispose();
}

