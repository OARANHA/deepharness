import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startOperationalReadHost,validateOperationalHostConfig} from './operational-host.mjs';
const config={version:1,enabled:true,issuer:'https://id.wandora.com.br/realms/deepharness',
  resource:'https://dsh-mcp.wandora.com.br/mcp',backendPort:3443,
  allowedOrigins:['https://chatgpt.com','https://chatgpt-mtls-proxy.invalid']};
function setup(){
  const state={ended:0,disposed:0,queries:[],role:{role:'dsh_mcp_reader',replica:false,
    grants_read:true,revocations_read:true,grants_write:false,revocations_write:false}};
  const cleanups=[];
  const ctx={effect:callback=>cleanups.push(callback()),fiber:{dispose:async()=>{
    state.disposed++;for(const dispose of cleanups.reverse())await dispose();}}};
  const deps={Pool:class{
    constructor(options){state.poolOptions=options;}
    on(){}
    async query(sql){state.queries.push(sql);return {rows:[state.role]};}
    async end(){state.ended++;}
  },loadLayeredEnv:()=>({}),runProfile(){},plugin:{apply(){}},
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
