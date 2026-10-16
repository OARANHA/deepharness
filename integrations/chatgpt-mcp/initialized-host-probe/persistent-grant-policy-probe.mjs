/** Disposable CI grant policy: real human JWT + official Cordis plugin + primary grants. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {Context} from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import {apply as storageJson} from '@deepseek-ai/dsh-storage-json';
import {DomainFacility} from '@deepseek-ai/dsh-storage-domain';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import {SessionStore} from '@deepseek-ai/dsh-session';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {WorkspaceRegistry} from '@deepseek-ai/dsh-workspace';
import TeamService from '@deepseek-ai/dsh-experimental-agent-team';
import {installPrivateReadPackage} from './install-private-read-package.mjs';
const exec=promisify(execFile),container='keycloak-mcp-postgres';
export async function probePersistentGrantPolicy({issuer,resource,keys,request,principal,withPrivateTransport=false,claims,controlRequest,controlClaims}) {
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.PGHOST!=='127.0.0.1'||
      process.env.PGPORT!=='15432'||process.env.PGDATABASE!=='token_revocation_test'||
      process.env.PGUSER!=='integration'||!process.env.PGPASSWORD)throw Error('Disposable grant CI configuration required');
  const root=await mkdtemp(join(tmpdir(),'dsh-persistent-grants-')),ctx=new Context();
  const open=()=>new Pool({host:'127.0.0.1',port:15432,user:'integration',database:'token_revocation_test',
    password:process.env.PGPASSWORD,max:1,connectionTimeoutMillis:1000,idleTimeoutMillis:1000,allowExitOnIdle:true});
  let wire,databaseStopped=false;const origin=withPrivateTransport?'https://client.example':'http://127.0.0.1:18081';
  let pool=open(),fiber,runtime,phase='offline package installation',revokeDuringGrantCheck=false,grantHash;
  const query=async(sql,params)=>{
    const result=await pool.query(sql,params);
    if(revokeDuringGrantCheck&&sql.startsWith('SELECT allowed')&&result.rows[0]?.allowed===true){
      revokeDuringGrantCheck=false;
      await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = FALSE WHERE grant_hash = $1',[grantHash]);
    }
    return result;
  };
  const ready=async()=>{
    for(let i=0;i<30;i++){
      try{await exec('docker',['exec',container,'pg_isready','-U','integration','-d','token_revocation_test'],{timeout:2000});return;}
      catch{await delay(500);}
    }throw Error('Disposable primary not ready');
  };
  try{
    const {plugin,createPersistentDshMcpReadPolicy,createPostgresRevocationBackend,createPostgresReadGrantStore,readSchema}=await installPrivateReadPackage(root);
    phase='schema';
    for(const file of ['001_token_revocations.sql','002_read_grants.sql']){
      await pool.query(await readSchema(file));
    }
    phase='official host init';
    await ctx.plugin(Storage);storageJson(ctx,{root:join(root,'storage')});
    const facility=new DomainFacility(ctx,{backend:'json',routes:{}});
    ctx.storage.mount('domain',facility);ctx.provide('storageDomain',facility);
    await ctx.plugin(JsonlSessionPersistence,{root:join(root,'sessions'),compression:'none'});
    await ctx.plugin(SessionStore);await ctx.plugin(SessionProjectionRegistry);
    const lead=ctx.sessions.create('persistent-policy-lead',{meta:{cwd:root}});
    const other=ctx.sessions.create('persistent-policy-other',{meta:{cwd:root}});
    await ctx.plugin(WorkspaceRegistry);ctx.provide('agents',{list:()=>[]});ctx.provide('subagents',{});
    await ctx.plugin(TeamService);
    const workspace=await ctx.workspaceRegistry.create(root);
    await workspace.attachSession(lead.id);await workspace.attachSession(other.id);
    const baseline=ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam;
    const scope={principalId:principal,workspaceId:workspace.id,leadSessionId:lead.id};
    grantHash=createHash('sha256').update(JSON.stringify(Object.values(scope))).digest('hex');
    const store=createPostgresReadGrantStore({query,timeoutMs:1500});
    phase='operational policy';
    const policy=createPersistentDshMcpReadPolicy({
      issuer,resource,discovery:{get:async()=>({issuer,publicKeys:keys})},query,
      allowedOrigins:withPrivateTransport?[origin,'https://chatgpt-mtls-proxy.invalid']:[origin],allowMissingNotBefore:true,revocationTimeoutMs:1500,
    });
    phase='plugin mount';
    ctx.provide('chatgptMcpReadPolicy',policy);
    const mount=async()=>{
      if(fiber)await fiber.dispose();
      fiber=await ctx.plugin(plugin,{endpointEnabled:false});
      runtime=ctx.get('chatgptMcpRead');assert.ok(runtime);
      if(wire)await wire.rebind();
    };
    await mount();
    const target={workspaceId:workspace.id,leadSessionId:lead.id};
    if(withPrivateTransport){
      phase='proxy wire initialization';
      const {createLoopbackPrivateMcpProbe}=await import('./loopback-private-mcp-probe.mjs');
      wire=await createLoopbackPrivateMcpProbe({resource,getService:()=>runtime,bearer:request.headers.authorization,origin,issuer,viaOperationalProxy:true});
      phase='proxy wire lifecycle';
      await wire.assertLifecycle();
    }
    const read=(args=target)=>wire?wire.read(args):runtime.runHttpRequest(request,()=>runtime.readTeam(args));
    const assertRow=async allowed=>{
      const result=await pool.query('SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = $1',[grantHash]);
      assert.equal(result.rowCount,1);assert.deepEqual(result.rows,[{allowed}]);
    };
    phase='missing grant';
    assert.equal(await store.hasReadGrant(scope),false);await assert.rejects(read(),/denied/);
    phase='exact grant';
    // Admin provisioning exists ONLY in the isolated test setup, never as MCP capability.
    await pool.query('INSERT INTO chatgpt_mcp_read_grants (grant_hash,allowed) VALUES ($1,TRUE)',[grantHash]);
    await assertRow(true);
    assert.deepEqual((await read()).members,baseline.members);
    if(wire)assert.deepEqual((await wire.read(target,request.headers.authorization,{withoutOrigin:true})).members,baseline.members);
    await assert.rejects(read({...target,leadSessionId:other.id}),/denied/);
    await assert.rejects(read({...target,leadSessionId:other.id,principalId:principal}),/denied/);
    phase='pool and plugin restart';
    await pool.end();pool=open();await mount();await assertRow(true);
    assert.equal((await read()).leadSessionId,lead.id);
    phase='allowed database restart';
    await pool.end();await exec('docker',['restart',container],{timeout:30000});await ready();
    pool=open();await mount();await assertRow(true);
    assert.equal((await read()).leadSessionId,lead.id);
    phase='grant revocation';
    await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = FALSE WHERE grant_hash = $1',[grantHash]);
    await assertRow(false);await assert.rejects(read(),/denied/);
    if(wire)await assert.rejects(wire.read(target,request.headers.authorization,{withoutOrigin:true}),/denied/);
    await pool.end();pool=open();await mount();await assertRow(false);await assert.rejects(read(),/denied/);
    phase='revoked database restart';
    await pool.end();await exec('docker',['restart',container],{timeout:30000});await ready();
    pool=open();await mount();await assertRow(false);await assert.rejects(read(),/denied/);
    phase='in-flight grant revocation';
    await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = TRUE WHERE grant_hash = $1',[grantHash]);
    revokeDuringGrantCheck=true;
    await assert.rejects(read(),/denied/);
    await assertRow(false);
    phase='database unavailable';
    await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = TRUE WHERE grant_hash = $1',[grantHash]);
    await assertRow(true);assert.equal((await read()).leadSessionId,lead.id);
    await pool.end();await exec('docker',['stop',container],{timeout:30000});databaseStopped=true;pool=open();
    await assert.rejects(store.hasReadGrant(scope),/denied/);
    await assert.rejects(read(),/denied/);
    await pool.end();await exec('docker',['start',container],{timeout:30000});await ready();databaseStopped=false;
    pool=open();await mount();await assertRow(true);
    assert.equal((await read()).leadSessionId,lead.id,'healthy restored primary must authorize its preserved exact grant');
    await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = FALSE WHERE grant_hash = $1',[grantHash]);
    await assertRow(false);await assert.rejects(read(),/denied/);
    if(wire){
      phase='wire token revocation';
      await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = TRUE WHERE grant_hash = $1',[grantHash]);
      await assertRow(true);assert.equal((await read()).leadSessionId,lead.id);
      const identity={issuer,subject:claims.sub,tokenId:claims.jti};
      await createPostgresRevocationBackend({query,timeoutMs:1500}).revoke(identity);
      const tokenHash=createHash('sha256').update(JSON.stringify([issuer,claims.sub,claims.jti])).digest('hex');
      const assertTokenRow=async()=>{
        const result=await pool.query('SELECT revoked FROM chatgpt_mcp_token_revocations WHERE token_hash = $1',[tokenHash]);
        assert.equal(result.rowCount,1);assert.deepEqual(result.rows,[{revoked:true}]);
      };
      const assertRevokedWithHealthyControl=async()=>{
        const now=Math.floor(Date.now()/1000);
        assert.ok(claims.exp>now&&controlClaims.exp>now,'both signed tokens must still be unexpired');
        const controlHash=createHash('sha256').update(JSON.stringify([issuer,controlClaims.sub,controlClaims.jti])).digest('hex');
        const controlRow=await pool.query('SELECT revoked FROM chatgpt_mcp_token_revocations WHERE token_hash = $1',[controlHash]);
        assert.equal(controlRow.rowCount,0);
        assert.equal((await wire.read(target,controlRequest.headers.authorization)).leadSessionId,lead.id);
        await assertTokenRow();await assert.rejects(read(),/denied/);
        await assert.rejects(wire.read(target,request.headers.authorization,{withoutOrigin:true}),/denied/);
        assert.ok(claims.exp>Math.floor(Date.now()/1000),'revoked token must not have expired during denial');
      };
      await assertRevokedWithHealthyControl();
      await pool.end();pool=open();await mount();await assertRow(true);await assertRevokedWithHealthyControl();
      phase='wire revoked token database restart';
      await pool.end();await exec('docker',['restart',container],{timeout:30000});await ready();
      pool=open();await mount();await assertRow(true);await assertRevokedWithHealthyControl();
      await pool.query('UPDATE chatgpt_mcp_read_grants SET allowed = FALSE WHERE grant_hash = $1',[grantHash]);
      await assertRow(false);
    }
    assert.equal(ctx.sessions.get(lead.id),lead);assert.equal(ctx.sessions.get(other.id),other);
    assert.deepEqual(ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam,baseline);
    if(wire)console.log('KEYCLOAK_PACKED_PROXY_OFFICIAL_DSH_PERSISTENT_GRANTS_MATCH: real human JWT + Envoy external fixture mTLS + private backend mTLS + installed plugin + real primary grants/revocation/restarts/outage + absent-Origin authorized');
    if(wire)console.log('KEYCLOAK_PACKED_MTLS_OFFICIAL_DSH_PERSISTENT_GRANTS_MATCH: installed lab.4 policy/plugin/transport + human PKCE JWT + real primary grants/revocation + plugin/DB restarts + outage denial');
    if(wire)console.log('KEYCLOAK_MTLS_OFFICIAL_DSH_PERSISTENT_GRANTS_MATCH: human PKCE JWT + direct mTLS SDK + official plugin + primary grants + token/grant persistent revocation + restart + outage denied');
    console.log('KEYCLOAK_CORDIS_PERSISTENT_GRANTS_MATCH: real human JWT + official plugin + exact primary grants + allowed/revoked restart + in-flight revocation + outage denied');
  }catch(error){
    const safeCodes=['28P01','42P01','42601','42703','42883','ECONNREFUSED','ECONNRESET','ETIMEDOUT'];
    const category=safeCodes.includes(error?.code)?error.code:
      error?.message==='MCP OAuth metadata denied'?'HTTPS_METADATA_DENIED':'INTERNAL_ERROR';
    throw Error('Persistent grant policy gate failed at '+phase+' ('+category+')');
  }
  finally{
    try{
      if(databaseStopped){await exec('docker',['start',container],{timeout:30000});await ready();}
    }finally{try{await wire?.close();}finally{try{await ctx.fiber.dispose();}finally{
      await pool.end().catch(()=>{});await rm(root,{recursive:true,force:true});
    }}}
  }
}

