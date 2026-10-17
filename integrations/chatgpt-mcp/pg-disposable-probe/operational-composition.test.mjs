/** Disposable official-service fixtures only. No HTTP listener or model runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, createHash, randomBytes} from 'node:crypto';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {Context} from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import {apply as storageJson} from '@deepseek-ai/dsh-storage-json';
import {DomainFacility} from '@deepseek-ai/dsh-storage-domain';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import {SessionStore} from '@deepseek-ai/dsh-session';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {WorkspaceRegistry} from '@deepseek-ai/dsh-workspace';
import TeamService from '@deepseek-ai/dsh-experimental-agent-team';
import pg from 'pg';
import * as plugin from '../plugin.mjs';
import {createPersistentDshMcpReadPolicy} from '../policy.mjs';
import {createAuthoritativePgReadQuery, assertAuthoritativePgReadPool, READ_GRANT_SQL} from '../adapters/authoritative-pg-read-query.mjs';
import {startOperationalReadHost} from '../../../deploy/mcp/operational-host.mjs';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'OARANHA/deepharness' ||
    !/^[0-9]{1,20}$/.test(process.env.TEST_POSTGRES_PASSWORD ?? '')) throw Error('Disposable CI only');
assert.equal(createRequire(import.meta.url)('pg/package.json').version, '8.16.3');
const {Pool}=pg;
const config={version:1,enabled:true,issuer:'https://id.wandora.com.br/realms/deepharness',
  resource:'https://dsh-mcp.wandora.com.br/mcp',backendPort:3443,
  allowedOrigins:['https://chatgpt.com','https://chatgpt-mtls-proxy.invalid']};
const digest=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');

test('operational host + official DSH services + signed individual + real primary', {timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'stage-d-composition-'));
  const ctx=new Context();
  const connection={host:'127.0.0.1',port:5432,user:'integration',
    password:process.env.TEST_POSTGRES_PASSWORD,database:'stage_d_test',connectionTimeoutMillis:1000};
  const admin=new Pool(connection);
  let owner,reader,boots=0,listenerCalls=0,projectionHook;
  const readerPassword=randomBytes(32).toString('hex');
  try {
    await admin.query('CREATE DATABASE dsh_mcp_grants');
    owner=new Pool({...connection,database:'dsh_mcp_grants'});
    await owner.query('CREATE TABLE chatgpt_mcp_read_grants (grant_hash CHAR(64) PRIMARY KEY, allowed BOOLEAN NOT NULL)');
    await owner.query('CREATE TABLE chatgpt_mcp_token_revocations (token_hash CHAR(64) PRIMARY KEY, revoked BOOLEAN NOT NULL)');
    await owner.query(`CREATE ROLE dsh_mcp_reader LOGIN PASSWORD '${readerPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await owner.query('REVOKE ALL ON DATABASE dsh_mcp_grants FROM PUBLIC');
    await owner.query('GRANT CONNECT ON DATABASE dsh_mcp_grants TO dsh_mcp_reader');
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await owner.query('GRANT USAGE ON SCHEMA public TO dsh_mcp_reader');
    await owner.query('GRANT SELECT ON chatgpt_mcp_read_grants,chatgpt_mcp_token_revocations TO dsh_mcp_reader');
    await owner.query('ALTER ROLE dsh_mcp_reader SET default_transaction_read_only=on');
    await owner.query("ALTER ROLE dsh_mcp_reader SET statement_timeout='750ms'");

    // Official DSH service fixtures; initialized before mounting the connector.
    // No replacement Web server, model, cold-resume, or production session.
    await ctx.plugin(Storage);storageJson(ctx,{root:join(root,'storage')});
    const facility=new DomainFacility(ctx,{backend:'json',routes:{}});
    ctx.storage.mount('domain',facility);ctx.provide('storageDomain',facility);
    await ctx.plugin(JsonlSessionPersistence,{root:join(root,'sessions'),compression:'none'});
    await ctx.plugin(SessionStore);await ctx.plugin(SessionProjectionRegistry);
    const lead=ctx.sessions.create('composition-fixture-lead',{meta:{cwd:root}});
    const other=ctx.sessions.create('composition-fixture-other',{meta:{cwd:root}});
    await ctx.plugin(WorkspaceRegistry);
    // TeamService's unused agent execution dependencies cannot execute models.
    ctx.provide('agents',{list:()=>[]});ctx.provide('subagents',{});
    await ctx.plugin(TeamService);
    const workspace=await ctx.workspaceRegistry.create(root);
    await workspace.attachSession(lead.id);await workspace.attachSession(other.id);
    const target={workspaceId:workspace.id,leadSessionId:lead.id};
    const hash=digest([config.issuer+'#alice',workspace.id,lead.id]);
    const baseline=ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam;
    const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const token=(claims={})=>{
      const body=encode({alg:'RS256',kid:'lab',typ:'JWT'})+'.'+encode({iss:config.issuer,aud:config.resource,
        sub:'alice',jti:'lab-token',iat:now,nbf:now,exp:now+300,token_use:'access',scope:'agent-teams:read',...claims});
      return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
    };
    const deps={Pool:class {
      constructor(options){reader=new Pool({...options,host:'127.0.0.1'});return reader;}
    },runProfile:async options=>{boots++;assert.equal(options.profile,'web');return {ctx};},
    loadLayeredEnv:()=>({}),plugin,createPolicy:createPersistentDshMcpReadPolicy,
    createAuthoritativePgReadQuery,assertAuthoritativePgReadPool,
    createDiscovery:()=>({get:async()=>({issuer:config.issuer,publicKeys:{lab:{...publicKey.export({format:'jwk'}),alg:'RS256'}}})}),sdk:{}};
    const result=await startOperationalReadHost(config,deps,{
      readFile:async path=>path.endsWith('db-password')?readerPassword:Buffer.from('not-a-real-certificate'),
      lookup:async name=>[{address:name==='deepharness-web-edge'?'172.19.0.2':'172.30.0.2'}],
      // DI seam proves orchestration without opening ANY MCP listener.
      listen:async options=>{listenerCalls++;assert.equal(options.ctx,ctx);return {close:async()=>{}};},
    });
    assert.equal(result.ctx,ctx);assert.equal(boots,1);assert.equal(listenerCalls,1);
    const service=result.service;
    const read=(jwt=token(),args=target,origin='https://chatgpt.com')=>service.runHttpRequest({headers:{authorization:'Bearer '+jwt,origin}},()=>service.readTeam(args));
    const grant=()=>owner.query('INSERT INTO chatgpt_mcp_read_grants VALUES ($1,TRUE) ON CONFLICT(grant_hash) DO UPDATE SET allowed=TRUE',[hash]);
    const revokeGrant=()=>owner.query('UPDATE chatgpt_mcp_read_grants SET allowed=FALSE WHERE grant_hash=$1',[hash]);

    await t.test('no implicit grant; exact scope reads detached official Team',async()=>{
      await assert.rejects(read(),/denied/);await grant();
      const view=await read();assert.equal(view.leadSessionId,lead.id);assert.deepEqual(view.members,baseline.members);
      view.members[0].name='detached';assert.deepEqual(ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam,baseline);
      assert.equal(ctx.sessions.get(lead.id),lead);
    });
    await t.test('individual sub, issuer, audience, expiry, scope, origin and target negatives',async()=>{
      for(const claims of [{sub:'bob'},{sub:null},{sub:''},{iss:'https://wrong.invalid'},{aud:'wrong'},
        {exp:now-1},{nbf:now+100},{scope:'wrong'},{token_use:'id'}]) await assert.rejects(read(token(claims)),/denied/);
      await assert.rejects(read('opaque-shared-secret'),/denied/);
      await assert.rejects(read(token(),{...target,workspaceId:'wrong',principalId:config.issuer+'#alice'}),/denied/);
      await assert.rejects(read(token(),{...target,leadSessionId:other.id}),/denied/);
      await assert.rejects(read(token(),target,'https://wrong.invalid'),/denied/);
      await assert.rejects(service.readTeam(target),/denied/);
    });
    await t.test('server SQLSTATE 57014 and SQL writes are denied on runtime pool',async()=>{
      const client=await reader.connect();
      try {
        await assert.rejects(client.query('SELECT pg_sleep(2)'),e=>e.code==='57014');
        await assert.rejects(client.query('DELETE FROM chatgpt_mcp_read_grants'),e=>['25006','42501'].includes(e.code));
      }finally{client.release(true);}
      assert.equal((await read()).leadSessionId,lead.id);
    });
    await t.test('server lock timeout denies the actual authorization read; no late allowance',async()=>{
      const lock=await owner.connect();
      try {
        await lock.query('BEGIN');await lock.query('LOCK TABLE chatgpt_mcp_read_grants IN ACCESS EXCLUSIVE MODE');
        await assert.rejects(read(),/denied/);
      }finally{await lock.query('ROLLBACK');lock.release();}
      assert.equal((await read()).leadSessionId,lead.id);
    });
    await t.test('abort while real pg SELECT waits refuses a late grant and discards checkout',async()=>{
      const lock=await owner.connect();
      const ctrl=new AbortController();let started,discarded;
      const began=new Promise(resolve=>{started=resolve;});
      const observed={connect:async()=>{
        const client=await reader.connect();
        return {query:(sql,params)=>{if(sql===READ_GRANT_SQL)started();return client.query(sql,params);},
          release:discard=>{discarded=discard;client.release(discard);}};
      }};
      try {
        await lock.query('BEGIN');await lock.query('LOCK TABLE chatgpt_mcp_read_grants IN ACCESS EXCLUSIVE MODE');
        const pending=createAuthoritativePgReadQuery({pool:observed})(READ_GRANT_SQL,[hash],{readFromPrimary:true,signal:ctrl.signal});
        const denied=assert.rejects(pending,/denied/);
        await began;ctrl.abort();assert.equal(discarded,undefined);
        await lock.query('ROLLBACK');await denied;assert.equal(discarded,true);
      }finally{await lock.query('ROLLBACK');lock.release();}
      assert.equal((await read()).leadSessionId,lead.id);
    });
    // A delayed projection is the future async seam in the official read binding.
    // All underlying data still comes from official SessionProjectionRegistry.
    const official=ctx.sessionProjections;
    const proxy=new Proxy(official,{get(object,key){
      if(key==='snapshot')return async(...args)=>{const value=object.snapshot(...args);await projectionHook?.();return value;};
      return Reflect.get(object,key);
    }});
    const {createOfficialDshMcpReadRuntime}=await import('../runtime.mjs');
    const {createPersistentDshMcpReadPolicy:createPolicy}=await import('../policy.mjs');
    const asyncRuntime=createOfficialDshMcpReadRuntime({workspaceRegistry:ctx.workspaceRegistry,sessions:ctx.sessions,sessionProjections:proxy},
      createPolicy({issuer:config.issuer,resource:config.resource,discovery:deps.createDiscovery(),
        query:createAuthoritativePgReadQuery({pool:reader}),allowedOrigins:config.allowedOrigins}));
    const delayedRead=()=>asyncRuntime.runHttpRequest({headers:{authorization:'Bearer '+token(),origin:'https://chatgpt.com'}},()=>asyncRuntime.readTeam(target));
    await t.test('grant and token revocation after async projection both deny',async()=>{
      projectionHook=revokeGrant;await assert.rejects(delayedRead(),/denied/);await grant();
      projectionHook=()=>owner.query('INSERT INTO chatgpt_mcp_token_revocations VALUES ($1,TRUE)',[digest([config.issuer,'alice','lab-token'])]);
      await assert.rejects(delayedRead(),/denied/);
      await assert.rejects(read(),/denied/);
      await owner.query('DELETE FROM chatgpt_mcp_token_revocations');projectionHook=undefined;
    });
    await t.test('lost SELECT privilege and unsafe role timeout fail closed',async()=>{
      await owner.query('REVOKE SELECT ON chatgpt_mcp_read_grants FROM dsh_mcp_reader');
      await assert.rejects(read(),/denied/);
      await owner.query('GRANT SELECT ON chatgpt_mcp_read_grants TO dsh_mcp_reader');
      await owner.query("ALTER ROLE dsh_mcp_reader SET statement_timeout='1500ms'");
      const unsafe=new Pool({...connection,user:'dsh_mcp_reader',password:readerPassword,database:'dsh_mcp_grants'});
      try {
        await assert.rejects(assertAuthoritativePgReadPool({pool:unsafe}),/denied/);
        await assert.rejects(createAuthoritativePgReadQuery({pool:unsafe})(READ_GRANT_SQL,[hash],{readFromPrimary:true,signal:new AbortController().signal}),/denied/);
      }finally{await unsafe.end();}
    });
    await t.test('existing-role database-only timeout migration and paired rollback preserve global role/grants',async()=>{
      const before=(await owner.query("SELECT rolconfig FROM pg_roles WHERE rolname='dsh_mcp_reader'")).rows;
      const beforeGrants=(await owner.query('SELECT * FROM chatgpt_mcp_read_grants ORDER BY grant_hash')).rows;
      const apply=await readFile(new URL('../../../deploy/mcp/migrate-reader-timeout.review.sql',import.meta.url),'utf8');
      const rollback=await readFile(new URL('../../../deploy/mcp/rollback-reader-timeout.review.sql',import.meta.url),'utf8');
      const migration=await owner.connect();
      try{
        await migration.query(apply);
        await assert.rejects(migration.query(apply),/Preexisting database deadline denied/);
        await migration.query('ROLLBACK');
        const fresh=new Pool({...connection,user:'dsh_mcp_reader',password:readerPassword,database:'dsh_mcp_grants'});
        try{await assertAuthoritativePgReadPool({pool:fresh});}finally{await fresh.end();}
        assert.deepEqual((await owner.query("SELECT rolconfig FROM pg_roles WHERE rolname='dsh_mcp_reader'")).rows,before);
        assert.deepEqual((await owner.query('SELECT * FROM chatgpt_mcp_read_grants ORDER BY grant_hash')).rows,beforeGrants);
        await migration.query(rollback);
        const reverted=new Pool({...connection,user:'dsh_mcp_reader',password:readerPassword,database:'dsh_mcp_grants'});
        try{await assert.rejects(assertAuthoritativePgReadPool({pool:reverted}),/denied/);}finally{await reverted.end();}
        await assert.rejects(migration.query(rollback),/Reader rollback baseline changed/);
        await migration.query('ROLLBACK');
      }finally{await migration.query('ROLLBACK');migration.release();}
    });
    await ctx.fiber.dispose();reader=undefined;
    await assert.rejects(read(),/denied/,'retained service fails after dispose');
    console.log('STAGE_D_OPERATIONAL_OFFICIAL_PG_COMPOSITION_MATCH');
  }finally{
    await ctx.fiber.dispose().catch(()=>{});
    if(reader)await reader.end().catch(()=>{});
    if(owner)await owner.end();
    await admin.end();await rm(root,{recursive:true,force:true});
  }
});
