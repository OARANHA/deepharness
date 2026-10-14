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
import { createServer, request } from 'node:https';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateMcpHttpHandler} from '../adapters/private-mcp-http-handler.mjs';
import {apply as readPlugin} from '../plugin.mjs';
import {createPersistentDshMcpReadPolicy} from '../policy.mjs';
import { generateKeyPairSync, sign, randomBytes, randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { prepareOfficialDshTeamRead } from '../adapters/prepare-official-dsh-team-read.mjs';
import { createPinnedJwtTransportAuthenticator } from '../adapters/pinned-jwt-transport-authenticator.mjs';
import { createDshHostReadBinding } from '../adapters/dsh-host-read-binding.mjs';
import { createDshAgentTeamHostReader } from '../adapters/dsh-agent-teams-host-reader.mjs';
import { projectAgentTeam } from '../adapters/agent-teams-read-model.mjs';
import { registerScopedTeamReadTool } from '../adapters/register-scoped-team-read-tool.mjs';

test('direct mTLS stateless MCP on official initialized DSH plugin', {timeout:30000},async t=>{
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

  // Certificates/keys are ephemeral test material. OpenSSL output never logged.
  const certRoot=join(root,'certs');await (await import('node:fs/promises')).mkdir(certRoot,{mode:0o700});
  const ssl=args=>execFileSync('openssl',args,{cwd:certRoot,stdio:'ignore'});
  ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Disposable Lab CA']);
  for(const name of ['server','client']){
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name]);
    await writeFile(join(certRoot,name+'.ext'),name==='server'?'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n');
    ssl(['x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',name+'.crt','-days','1','-extfile',name+'.ext']);
    await chmod(join(certRoot,name+'.key'),0o600);
  }
  ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','rogue.key','-out','rogue.crt','-days','1','-subj','/CN=untrusted']);
  await chmod(join(certRoot,'ca.key'),0o600);await chmod(join(certRoot,'rogue.key'),0o600);
  const file=name=>readFile(join(certRoot,name));
  let handler,httpRequests=0;
  const http=createServer({key:await file('server.key'),cert:await file('server.crt'),
    ca:await file('ca.crt'),requestCert:true,rejectUnauthorized:true},(req,res)=>{
      httpRequests++;handler.handle(req,res).catch(()=>res.destroy());
    });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{handler?.dispose();await new Promise(resolve=>{http.close(resolve);http.closeAllConnections();});});
  const port=http.address().port,resource='https://localhost:'+port+'/mcp',issuer='https://id.example';
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const keys={lab:{...publicKey.export({format:'jwk'}),alg:'RS256'}};
  const hash=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
  let grantAllowed=true,revoked=false,dbHealthy=true;
  const query=async(sql,params,options)=>{
    assert.equal(options.readFromPrimary,true);
    if(!dbHealthy)throw Error('unavailable');
    if(sql.startsWith('SELECT allowed')){
      return {rows:params[0]===hash([issuer+'#alice',workspace.id,lead.id])?[{allowed:grantAllowed}]:[]};
    }
    assert.ok(sql.startsWith('SELECT revoked'),'transport must never write SQL');
    return {rows:revoked?[{revoked:true}]:[]};
  };
  const policy=createPersistentDshMcpReadPolicy({issuer,resource,query,allowedOrigins:['https://client.example'],
    discovery:{get:async()=>({issuer,publicKeys:keys})}});
  ctx.provide('chatgptMcpReadPolicy',policy);
  const fiber=await ctx.plugin({name:'lab-read-plugin',inject:['workspaceRegistry','sessions','sessionProjections','chatgptMcpReadPolicy'],apply:readPlugin},{endpointEnabled:false});
  const service=ctx.chatgptMcpRead;
  assert.ok(service);
  handler=createPrivateMcpHttpHandler({enabled:true,resource,allowedOrigins:['https://client.example'],
    service,McpServer,StreamableHTTPServerTransport,
    inputSchema:z.object({workspaceId:z.string().min(1).max(256),leadSessionId:z.string().min(1).max(256)}).strict()});
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const jwt=subject=>{
    const now=Math.floor(Date.now()/1000);
    const body=encode({alg:'RS256',kid:'lab',typ:'JWT'})+'.'+encode({iss:issuer,aud:resource,sub:subject,
      jti:'test-'+subject,iat:now,nbf:now,exp:now+300,token_use:'access',scope:'agent-teams:read'});
    return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  };
  const alice=jwt('alice'),clientCert=await file('client.crt'),clientKey=await file('client.key'),ca=await file('ca.crt');
  let id=0;
  const send=async(method,params={},headers={},tls={},path='/mcp',verb='POST')=>{
    const body=JSON.stringify({jsonrpc:'2.0',id:++id,method,params});
    return new Promise((resolve,reject)=>{
      const req=request({hostname:'127.0.0.1',port,servername:'localhost',method:verb,path,agent:false,
        ca,cert:clientCert,key:clientKey,rejectUnauthorized:true,...tls,
        headers:{host:'localhost:'+port,origin:'https://client.example',authorization:'Bearer '+alice,
          'content-type':'application/json',accept:'application/json, text/event-stream',...headers}},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({
          status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
      });
      req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('lab timeout')));req.end(verb==='GET'?undefined:body);
    });
  };
  const certificateRejection=async tls=>{
    let timer;const beforeRequests=httpRequests;
    const serverError=new Promise((resolve,reject)=>{
      http.once('tlsClientError',(error,socket)=>resolve({error,socket}));
      timer=setTimeout(()=>reject(Error('no TLS rejection observed')),2500);
    });
    try{
      await assert.rejects(send('tools/list',{}, {},tls),error=>error.message!=='lab timeout');
      const {error,socket}=await serverError;
      assert.equal(socket.authorized,false);
      assert.ok(/certificate|unknown ca|verify/i.test(error.message)||
        ['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(socket.authorizationError),
        'server TLS state must prove certificate rejection');
      assert.equal(httpRequests,beforeRequests,'rejected peer must not reach HTTP handler');
    }finally{clearTimeout(timer);}
  };
  await certificateRejection({cert:undefined,key:undefined});
  await certificateRejection({cert:await file('rogue.crt'),key:await file('rogue.key')});
  await assert.rejects(send('tools/list',{}, {},{ca:await file('rogue.crt')}),
    error=>['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code));

  const denied=await send('tools/list',{}, {authorization:''});assert.equal(denied.status,401);
  assert.ok(denied.headers['www-authenticate'].includes('resource_metadata'));
  const metadata=await send('',{}, {authorization:''},{},'/.well-known/oauth-protected-resource/mcp','GET');
  assert.equal(metadata.status,200);assert.equal(JSON.parse(metadata.text).resource,resource);
  const init=await send('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'tls-lab',version:'1'}});
  assert.equal(init.status,200);assert.equal(init.headers['mcp-session-id'],undefined);
  const listed=await send('tools/list');
  assert.equal(listed.status,200);assert.deepEqual(JSON.parse(listed.text).result.tools.map(x=>x.name),['dsh_read_agent_team']);
  const target={workspaceId:workspace.id,leadSessionId:lead.id};
  const call=(args=target,headers={})=>send('tools/call',{name:'dsh_read_agent_team',arguments:args},headers);
  const allowed=await call();assert.equal(allowed.status,200);
  const result=JSON.parse(allowed.text).result;assert.equal(result.isError,undefined);
  assert.deepEqual(JSON.parse(result.content[0].text).members,realProjection.members);
  for(const args of [{...target,leadSessionId:'other'},{...target,workspaceId:'other'},{...target,principalId:issuer+'#alice'}]){
    const r=JSON.parse((await call(args)).text);assert.ok(r.error||r.result?.isError);
  }
  const bob=JSON.parse((await call(target,{authorization:'Bearer '+jwt('bob')})).text);assert.ok(bob.result.isError);
  for(const [headers,status] of [[{origin:'https://evil.example'},403],[{origin:''},403],[{host:'evil.example'},421],[{'mcp-session-id':'forged'},400]]){
    assert.equal((await call(target,headers)).status,status);
  }
  grantAllowed=false;assert.equal(JSON.parse((await call()).text).result.isError,true);
  grantAllowed=true;revoked=true;assert.equal((await call()).status,401);
  revoked=false;dbHealthy=false;assert.equal((await call()).status,401);dbHealthy=true;
  await workspace.detachSession(lead.id);assert.equal(JSON.parse((await call()).text).result.isError,true);
  await workspace.attachSession(lead.id);
  assert.deepEqual(ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam,realProjection);
  await fiber.dispose();
  const unloaded=await call();assert.ok([401,403].includes(unloaded.status));
  handler.dispose();assert.equal((await call()).status,503);
  console.log('PRIVATE_MTLS_OFFICIAL_DSH_MCP_MATCH: verified TLS peer + scoped SDK lifecycle + official plugin read + denied principal/Lead + revocation + unload');
});
