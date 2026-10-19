import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startOperationalReadHost,validateOperationalHostConfig} from './operational-host.mjs';
import {createAuthoritativePgReadQuery,assertAuthoritativePgReadPool,READ_GRANT_SQL} from '../../integrations/chatgpt-mcp/adapters/authoritative-pg-read-query.mjs';
const config={version:1,enabled:true,issuer:'https://id.wandora.com.br/realms/deepharness',
  resource:'https://dsh-mcp.wandora.com.br/mcp',backendPort:3443,
  allowedOrigins:['https://chatgpt.com','https://chatgpt-mtls-proxy.invalid']};
function setup(){
  const state={ended:0,disposed:0,queries:[],role:{role:'dsh_mcp_reader',replica:false,
    database_name:'dsh_mcp_grants',default_read_only:'on',transaction_read_only:'on',statement_timeout:'750ms',schema_create:false,grants_read:true,revocations_read:true,grants_write:false,revocations_write:false}};
  const cleanups=[];
  const ctx={effect:callback=>cleanups.push(callback()),fiber:{dispose:async()=>{
    state.disposed++;for(const dispose of cleanups.reverse())await dispose();}}};
  const deps={Pool:class{
    constructor(options){state.poolOptions=options;}
    on(){}
    async connect(){return {query:async sql=>{state.queries.push(sql);return {rows:sql.startsWith('SELECT\n')?[state.role]:[]};},release:discard=>{state.discard=discard;}};}
    async end(){state.ended++;}
  },createAuthoritativePgReadQuery,assertAuthoritativePgReadPool,loadLayeredEnv:()=>({}),runProfile(){},plugin:{apply(){}},
    createSemanticBridge:()=>({}),
    createSemanticHttpHandler:()=>({handle(){},dispose(){}}),
    createPolicy:options=>{state.policy=options;return options;},
    createDiscovery:options=>({get:async()=>{state.discovery=options;}}),sdk:{}};
  const seams={
    readFile:async(path)=>path.endsWith('db-password')?'a'.repeat(64):Buffer.from('private test fixture'),
    lookup:async name=>[{address:name==='deepharness-web-edge'?'172.19.0.12':'172.30.0.2'}],
    boot:async options=>{state.boot=options;await options.createPolicy(ctx);return {ctx,service:{}};},
    listen:async options=>{state.listener=options;return {};},
  };
  return {state,ctx,deps,seams};
}
test('disabled configuration is rejected before loading credentials or booting',async()=>{
  const x=setup();await assert.rejects(startOperationalReadHost({...config,enabled:false},x.deps,x.seams),/disabled/);
  assert.equal(x.state.poolOptions,undefined);
});
test('unknown config including credential or mutable grant fields is rejected',()=>{
  assert.throws(()=>validateOperationalHostConfig({...config,password:'not-accepted'}));
  assert.throws(()=>validateOperationalHostConfig({...config,grants:[]}));
});
test('semantic bridge remains opt-in and requires one exact client certificate pin',()=>{
  assert.equal(validateOperationalHostConfig(config).semanticBridge,undefined);
  assert.equal(validateOperationalHostConfig({...config,semanticBridge:{enabled:false}}).semanticBridge.enabled,false);
  assert.throws(()=>validateOperationalHostConfig({...config,semanticBridge:{enabled:true}}));
  assert.throws(()=>validateOperationalHostConfig({...config,semanticBridge:{enabled:true,clientFingerprintSha256:'00'}}));
  assert.throws(()=>validateOperationalHostConfig({...config,semanticBridge:{enabled:true,
    clientFingerprintSha256:'00:'.repeat(31)+'00',extra:true}}));
});
test('one official Web host, fixed read-only pool, pinned discovery and private listener',async()=>{
  const x=setup();const host=await startOperationalReadHost(config,x.deps,x.seams);
  assert.equal(host.ctx,x.ctx);assert.equal(x.state.poolOptions.user,'dsh_mcp_reader');
  assert.equal(x.state.poolOptions.max,2);assert.equal(x.state.poolOptions.host,'mcp-grants-db');
  assert.ok(x.state.queries.every(sql=>sql.startsWith('SELECT')));
  assert.ok(x.state.boot.args.includes('172.19.0.12'));
  assert.equal(x.state.listener.host,'172.30.0.2');assert.equal(x.state.listener.port,3443);
  assert.equal(x.state.listener.enabled,true);assert.equal(x.state.discovery.issuer,config.issuer);
  await host.ctx.fiber.dispose();assert.equal(x.state.ended,1);
});
test('separate semantic route requires operator pin and binds the official host bridge',async()=>{
  const x=setup(),fingerprint='aa:'.repeat(31)+'aa',semanticBridge={sendLeadInstruction(){}};
  x.seams.boot=async options=>{
    x.state.boot=options;await options.createPolicy(x.ctx);return {ctx:x.ctx,service:{},semanticBridge};
  };
  const host=await startOperationalReadHost({...config,semanticBridge:{enabled:true,clientFingerprintSha256:fingerprint}},x.deps,x.seams);
  assert.equal(x.state.listener.semanticBridge.bridge,semanticBridge);
  assert.equal(x.state.listener.semanticBridge.clientFingerprintSha256,fingerprint);
  assert.equal(typeof x.state.listener.createSemanticHttpHandler,'function');
  assert.equal(typeof x.state.listener.semanticBridge.audit,'function');
  await host.ctx.fiber.dispose();
});
for(const field of ['replica','grants_write','revocations_write'])test(field+' prevents boot and listener',async()=>{
  const x=setup();x.state.role[field]=true;
  await assert.rejects(startOperationalReadHost(config,x.deps,x.seams),/denied/);
  assert.equal(x.state.boot,undefined);assert.equal(x.state.listener,undefined);assert.equal(x.state.ended,1);
});
test('ambiguous Docker alias refuses before opening the pool',async()=>{
  const x=setup();x.seams.lookup=async()=>[{address:'172.19.0.12'},{address:'172.19.0.13'}];
  await assert.rejects(startOperationalReadHost(config,x.deps,x.seams),/denied/);
  assert.equal(x.state.poolOptions,undefined);
});
test('listener startup failure disposes the actual host and closes its pool once',async()=>{
  const x=setup();x.seams.listen=async()=>{throw Error('private key details must not escape');};
  await assert.rejects(startOperationalReadHost(config,x.deps,x.seams),/^Error: Operational MCP host initialization denied$/);
  assert.equal(x.state.disposed,1);assert.equal(x.state.ended,1);
});

test('host query preserves primary intent and AbortSignal; unsafe timeout denies startup',async()=>{
 const x=setup();await startOperationalReadHost(config,x.deps,x.seams);
 const options={readFromPrimary:true,signal:new AbortController().signal};
 assert.deepEqual(await x.state.policy.query(READ_GRANT_SQL,['a'.repeat(64)],options),{rows:[]});
 await assert.rejects(x.state.policy.query(READ_GRANT_SQL,['a'.repeat(64)]));
 await x.ctx.fiber.dispose();
 const y=setup();y.state.role.statement_timeout='1500ms';
 await assert.rejects(startOperationalReadHost(config,y.deps,y.seams));
 assert.equal(y.state.boot,undefined);assert.equal(y.state.listener,undefined);
});
