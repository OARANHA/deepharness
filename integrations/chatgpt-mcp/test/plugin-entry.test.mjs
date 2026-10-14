import test from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../plugin.mjs';
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
