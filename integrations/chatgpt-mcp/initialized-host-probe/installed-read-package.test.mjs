import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installPrivateReadPackage} from './install-private-read-package.mjs';
test('offline installed policy and plugin preserve grants and transport reload lifecycle',{timeout:30000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-installed-combined-contract-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const p=await installPrivateReadPackage(root);
  assert.equal(p.version,'0.1.0-lab.4');
  assert.match(await p.readSchema('002_read_grants.sql'),/chatgpt_mcp_read_grants/);
  await assert.rejects(p.readSchema('../package.json'));
  let grant=false,queries=0;
  const policy=p.createPersistentDshMcpReadPolicy({issuer:'https://id.example',resource:'https://mcp.example/mcp',
    discovery:{get:async()=>({issuer:'https://id.example',publicKeys:{}})},allowedOrigins:['https://client.example'],
    query:async()=>{queries++;return {rows:[{allowed:grant}]};}});
  const store=p.createPostgresReadGrantStore({query:policy.query});
  const scope={principalId:'https://id.example#alice',workspaceId:'ws',leadSessionId:'lead'};
  assert.equal(await store.hasReadGrant(scope),false);grant=true;
  assert.equal(await store.hasReadGrant(scope),true);assert.equal(queries,2);
  function mount(){
    let service,dispose;
    p.plugin.apply({workspaceRegistry:{get(){}},sessions:{get(){}},sessionProjections:{snapshot(){}},
      chatgptMcpReadPolicy:policy,provide:(name,value)=>{service=value;},effect:fn=>{dispose=fn();}}, {endpointEnabled:false});
    return {service,dispose};
  }
  const options={enabled:true,McpServer:class{},StreamableHTTPServerTransport:class{},inputSchema:{}};
  const reply=()=>({status:undefined,writeHead(status){this.status=status;return this;},end(){this.writableEnded=true;}});
  const first=mount(),old=first.service.createPrivateTransport(options);
  let res=reply();await old.handle({socket:{}},res);assert.equal(res.status,403);
  first.dispose();res=reply();await old.handle({socket:{}},res);assert.equal(res.status,503);
  assert.throws(()=>first.service.createPrivateTransport(options),/denied/);
  const second=mount(),fresh=second.service.createPrivateTransport(options);
  res=reply();await fresh.handle({socket:{}},res);assert.equal(res.status,403);
  second.dispose();res=reply();await fresh.handle({socket:{}},res);assert.equal(res.status,503);
});
