import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateKeyPairSync, sign } from 'node:crypto';
import Storage from '@deepseek-ai/dsh-storage';
import { apply as storageJson } from '@deepseek-ai/dsh-storage-json';
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import TeamService from '@deepseek-ai/dsh-experimental-agent-team';
import { SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
const exec = promisify(execFile);
test('actual private tarball installs and reads official initialized host with exact individual grants', {timeout:30000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-packed-read-'));
  const ctx=new Context();
  t.after(async()=>{try{await ctx.fiber.dispose();}finally{await rm(root,{recursive:true,force:true});}});
  const source=fileURLToPath(new URL('../',import.meta.url));
  const {stdout}=await exec('npm',['pack',source,'--ignore-scripts','--json','--pack-destination',root],{timeout:15000});
  const [packed]=JSON.parse(stdout);
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const expected=new Set(['package.json',...manifest.files]);
  assert.equal(packed.files.length,expected.size);
  for(const file of packed.files){assert.ok(expected.has(file.path),'unexpected packaged path');assert.equal(file.mode,420);}
  assert.equal(manifest.private,true);
  assert.equal(manifest.scripts.preinstall,undefined);
  assert.equal(manifest.scripts.postinstall,undefined);
  const install=join(root,'install');await mkdir(install);
  await exec('npm',['install','--prefix',install,'--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',
    join(root,packed.filename)],{timeout:15000});
  const resolve=createRequire(join(install,'package.json'));
  const entry=resolve.resolve('@wandora/deepharness-chatgpt-mcp-read');
  assert.ok(entry.startsWith(join(install,'node_modules')));
  const exported=await import(pathToFileURL(entry).href);
  assert.deepEqual(Object.keys(exported),['createOfficialDshMcpReadRuntime']);
  await ctx.plugin(Storage);storageJson(ctx,{root:join(root,'storage')});
  const facility=new DomainFacility(ctx,{backend:'json',routes:{}});
  ctx.storage.mount('domain',facility);ctx.provide('storageDomain',facility);
  await ctx.plugin(JsonlSessionPersistence,{root:join(root,'sessions'),compression:'none'});
  await ctx.plugin(SessionStore);await ctx.plugin(SessionProjectionRegistry);
  const lead=ctx.sessions.create('packed-lead',{meta:{cwd:root}});
  const other=ctx.sessions.create('packed-other-lead',{meta:{cwd:root}});
  await ctx.plugin(WorkspaceRegistry);ctx.provide('agents',{list:()=>[]});ctx.provide('subagents',{});
  await ctx.plugin(TeamService);
  const host={workspaceRegistry:ctx.workspaceRegistry,sessions:ctx.sessions,sessionProjections:ctx.sessionProjections};
  const workspace=await host.workspaceRegistry.create(root);
  await workspace.attachSession(lead.id);await workspace.attachSession(other.id);
  const baseline=host.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam;
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const issuer='https://id.example',resource='https://mcp.example/mcp';
  const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const token=subject=>{
    const body=encode({alg:'RS256',kid:'pack',typ:'JWT'})+'.'+encode({
      iss:issuer,aud:resource,sub:subject,jti:'pack-token',iat:now,nbf:now,exp:now+300,token_use:'access',scope:'agent-teams:read'});
    return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  };
  let revoked=false,offline=false;
  // Package composition uses a primary-query contract double here.
  // The actual PostgreSQL/keycloak combined lifecycle gate is separate.
  const policy={
    issuer,resource,discovery:{get:async()=>({issuer,publicKeys:{pack:{...publicKey.export({format:'jwk'}),alg:'RS256'}}})},
    query:async()=>{if(offline)throw Error('offline');return {rows:revoked?[{revoked:true}]:[]};},
    grants:[{principalId:issuer+'#alice',workspaceId:workspace.id,leadSessionId:lead.id}],
    allowedOrigins:['https://client.example'],
  };
  const runtime=exported.createOfficialDshMcpReadRuntime(host,policy);
  assert.deepEqual(Object.keys(runtime).sort(),['handleOAuthRequest','readTeam','runHttpRequest']);
  const target={workspaceId:workspace.id,leadSessionId:lead.id};
  const read=(subject='alice',args=target)=>runtime.runHttpRequest({
    headers:{authorization:'Bearer '+token(subject),origin:'https://client.example'},
  },()=>runtime.readTeam(args));
  const allowed=await read();assert.equal(allowed.leadSessionId,lead.id);assert.deepEqual(allowed.members,baseline.members);
  await assert.rejects(read('bob'),/denied/);
  await assert.rejects(read('alice',{...target,leadSessionId:other.id}),/denied/);
  revoked=true;await assert.rejects(read(),/denied/);
  revoked=false;offline=true;await assert.rejects(read(),/denied/);
  offline=false;
  const bundlePatch=await readFile(join(install,'node_modules','@wandora','deepharness-chatgpt-mcp-read','cordis.patch.yml'),'utf8');
  assert.equal(manifest.dsh.bundle.patch,'./cordis.patch.yml');
  assert.match(bundlePatch,/disabled: true/);
  assert.match(bundlePatch,/endpointEnabled: false/);
  assert.equal((bundlePatch.match(/- id:/g)||[]).length,1,'bundle must not recreate host services');
  const plugin=await import(pathToFileURL(resolve.resolve('@wandora/deepharness-chatgpt-mcp-read/plugin')).href);
  assert.deepEqual(plugin.inject,['workspaceRegistry','sessions','sessionProjections','chatgptMcpReadPolicy']);
  assert.equal(ctx.get('chatgptMcpRead'),undefined);
  ctx.provide('chatgptMcpReadPolicy',policy);
  const pluginFiber=await ctx.plugin(plugin,{endpointEnabled:false});
  const mounted=ctx.get('chatgptMcpRead');
  assert.ok(mounted,'official Cordis must mount the packaged internal read service');
  const mountedRead=()=>mounted.runHttpRequest({
    headers:{authorization:'Bearer '+token('alice'),origin:'https://client.example'},
  },()=>mounted.readTeam(target));
  assert.equal((await mountedRead()).leadSessionId,lead.id);
  assert.equal(ctx.sessions.get(lead.id),lead,'plugin must reuse existing Lead');
  await pluginFiber.dispose();
  assert.equal(ctx.get('chatgptMcpRead'),undefined,'unload must remove the internal service');
  await assert.rejects(mountedRead(),/denied/,'retained reference must fail after plugin unload');
  await assert.rejects(async()=>{await ctx.plugin(plugin,{endpointEnabled:true});},/denied/);
  assert.equal(ctx.sessions.get(lead.id),lead,'plugin unload must preserve existing sessions');
  console.log('PACKED_OFFICIAL_DSH_CORDIS_PLUGIN_MATCH: installed bundle + official inject/apply + existing Lead + no endpoint + unload denies retained handles');
  host.sessions={get:()=>undefined};await assert.rejects(read(),/denied/);
  assert.deepEqual(ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam,baseline);
  console.log('PACKED_OFFICIAL_DSH_READ_RUNTIME_MATCH: installed tarball + official host + individual exact grants + revocation contract + replacement denial');
});
