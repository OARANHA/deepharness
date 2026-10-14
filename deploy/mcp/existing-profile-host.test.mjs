import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootExistingProfileReadHost} from './existing-profile-host.mjs';
function setup(){
  const map=new Map(),events=[],service={createPrivateTransport(){throw Error('must stay closed');}};
  const ctx={workspaceRegistry:{},sessions:{},sessionProjections:{},
    get:key=>map.get(key),provide:(key,value)=>map.set(key,value),
    fiber:{dispose:async()=>events.push('disposed')},
    plugin:async(plugin,config)=>{events.push(config);map.set('chatgptMcpRead',service);}};
  const opts={runProfile:async value=>{events.push(value);return {ctx,shutdown:{}};},
    environment:{},args:['--no-open','--host','127.0.0.1'],plugin:{apply(){}},createPolicy:async host=>{assert.equal(host,ctx);return {};}};
  return {ctx,opts,events,map,service};
}
test('boots Web once, forwards arguments and mounts on the identical context without transport',async()=>{
  const x=setup(),result=await bootExistingProfileReadHost(x.opts);
  assert.equal(result.ctx,x.ctx);assert.equal(result.service,x.service);
  assert.equal(x.events.length,2);assert.equal(x.events[0].profile,'web');
  assert.deepEqual(x.events[0].args,x.opts.args);assert.deepEqual(x.events[1],{endpointEnabled:false});
});
test('changed host services abort and dispose the booted context',async()=>{
  const x=setup();x.opts.createPolicy=async ctx=>{ctx.sessions={};return {};};
  await assert.rejects(bootExistingProfileReadHost(x.opts),/denied/);
  assert.equal(x.events.at(-1),'disposed');assert.equal(x.map.has('chatgptMcpReadPolicy'),false);
});
test('policy failure disposes and suppresses credential-bearing errors',async()=>{
  const x=setup();x.opts.createPolicy=async()=>{throw Error('private password');};
  await assert.rejects(bootExistingProfileReadHost(x.opts),/^Error: Existing DSH read host composition denied \(policy\)$/);
  assert.equal(x.events.at(-1),'disposed');
});
test('existing connector policy is never overwritten',async()=>{
  const x=setup();const policy={};x.map.set('chatgptMcpReadPolicy',policy);
  await assert.rejects(bootExistingProfileReadHost(x.opts),/denied/);
  assert.equal(x.map.get('chatgptMcpReadPolicy'),policy);
});
test('no read service means composition fails closed',async()=>{
  const x=setup();x.ctx.plugin=async()=>{};
  await assert.rejects(bootExistingProfileReadHost(x.opts),/denied/);
  assert.equal(x.events.at(-1),'disposed');
});
