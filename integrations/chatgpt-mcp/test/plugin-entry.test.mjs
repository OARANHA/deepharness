import test from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../plugin.mjs';
function mounted() {
  let service,unload;
  const ctx={
    workspaceRegistry:{get:()=>undefined},sessions:{get:()=>undefined},sessionProjections:{snapshot:()=>undefined},
    chatgptMcpReadPolicy:{issuer:'https://id.example',resource:'https://mcp.example/mcp',
      allowedOrigins:['https://client.example'],grants:[],query:async()=>({rows:[]}),
      discovery:{get:async()=>({issuer:'https://id.example',publicKeys:{}})}},
    provide:(name,value)=>{service=value;},effect:fn=>{unload=fn();},
  };
  plugin.apply(ctx,{endpointEnabled:false});
  return {service,unload:()=>unload()};
}
const options={enabled:true,McpServer:class {},StreamableHTTPServerTransport:class {},inputSchema:{}};
const response=()=>({status:undefined,headersSent:false,writableEnded:false,
  writeHead(status){this.status=status;return this;},end(){this.writableEnded=true;},destroy(){}});
test('plugin creates only explicit policy-pinned private transport and unload invalidates retained handler',async()=>{
  const f=mounted();
  assert.equal(typeof f.service.createPrivateTransport,'function');
  assert.throws(()=>f.service.createPrivateTransport({...options,enabled:false}),/denied/i);
  for(const override of ['resource','allowedOrigins','service']){
    assert.throws(()=>f.service.createPrivateTransport({...options,[override]:{}}),/denied/i);
  }
  const handler=f.service.createPrivateTransport(options);
  const res=response();await handler.handle({socket:{}},res);assert.equal(res.status,403);
  assert.throws(()=>f.service.createPrivateTransport(options),/denied/i);
  f.unload();
  const after=response();await handler.handle({socket:{}},after);assert.equal(after.status,503);
  assert.throws(()=>f.service.createPrivateTransport(options),/denied/i);
});
test('plugin declares only existing read services and trusted operator policy',()=>{
  assert.equal(typeof plugin.apply,'function');
  assert.deepEqual(plugin.inject,['workspaceRegistry','sessions','sessionProjections','chatgptMcpReadPolicy']);
});
test('plugin refuses listener activation, injected config functions and absent policy',()=>{
  for(const config of [{endpointEnabled:true},{endpointEnabled:'false'},{query:()=>{}},null,[]]){
    assert.throws(()=>plugin.apply({},config),/denied/);
  }
  assert.throws(()=>plugin.apply({provide(){},effect(){}},{endpointEnabled:false}),/denied/);
});
