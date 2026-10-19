import test from 'node:test';
import assert from 'node:assert/strict';
import {createDshSemanticBridge} from '../adapters/dsh-semantic-bridge.mjs';

const leadId='lead-1', workspaceId='workspace-1';
function team(lead=leadId) {
  return {members:[{id:lead,name:'Lead',role:'lead',phase:'active'}],tasks:[
    {id:'task-1',revision:1,subject:'Inspect',description:'Inspect safely',status:'in_progress',
      blockedBy:[],writeScopes:[],ready:true,writeScopeWarnings:[]},
  ]};
}
function fixture({members=[leadId],workspace=workspaceId,projection=team(),page={records:[],hasMore:false}}={}) {
  const calls=[];
  const workspaceRecord={id:workspace,sessionIds:members};
  const workspaceRegistry={get:id=>id===workspace?workspaceRecord:undefined,list:()=>[workspaceRecord]};
  const sessionController={
    projections:async({sessionId})=>{calls.push(['projections',sessionId]);return {kind:'sequenced',asOfSeq:4,values:{agentTeam:projection}};},
    page:async request=>{calls.push(['page',request]);return page;},
    prompt:async request=>{calls.push(['prompt',request]);return {accepted:true};},
    inspect:async id=>({meta:{id}}),
  };
  return {bridge:createDshSemanticBridge({workspaceRegistry,sessionController}),calls};
}
test('lists only valid Agent Team leads in the requested workspace',async()=>{
  const f=fixture();
  assert.deepEqual(await f.bridge.listTeams({workspaceId}),[{leadSessionId:leadId,members:team().members,tasks:team().tasks}]);
  assert.deepEqual(f.calls,[['projections',leadId]]);
});

test('reads bounded official Session history at the exact projection cursor',async()=>{
  const records=[
    {type:'event',event:{type:'user/message',seq:3,time:1,data:{role:'user',content:[{type:'text',text:'hello'}]}}},
    {type:'event',event:{type:'assistant/message',seq:4,time:2,data:{message:{role:'assistant',content:[
      {type:'text',text:'world'},{type:'tool-call',arguments:{secret:'omit'}},
    ]}}}},
  ];
  const f=fixture({page:{records,hasMore:true}});
  assert.deepEqual(await f.bridge.readLeadChat({workspaceId,leadSessionId:leadId,maxMessages:20}),
    {messages:[{role:'user',text:'hello'},{role:'assistant',text:'world'}],hasMore:true});
  assert.deepEqual(f.calls[1],['page',{address:{kind:'session',sessionId:leadId},throughSeq:4,maxMessages:20}]);
});

test('queues only text to a Lead after workspace and Team verification',async()=>{
  const f=fixture();
  assert.deepEqual(await f.bridge.sendLeadInstruction({workspaceId,leadSessionId:leadId,
    requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'Continue the lab task'}),
    {accepted:true,requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38'});
  assert.deepEqual(f.calls.at(-1),['prompt',{sessionId:leadId,requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',
    mode:'queue',content:[{type:'text',text:'Continue the lab task'}]}]);
});

test('denies missing workspace and cross-workspace Lead before any prompt',async()=>{
  const f=fixture({members:[]});
  await assert.rejects(f.bridge.sendLeadInstruction({workspaceId,leadSessionId:leadId,
    requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'no'}),/denied/i);
  await assert.rejects(f.bridge.listTeams({workspaceId:'missing'}),/denied/i);
  assert.equal(f.calls.some(([name])=>name==='prompt'),false);
});

test('rechecks workspace membership after an asynchronous projection before writing',async()=>{
  const workspaceRecord={id:workspaceId,sessionIds:[leadId]};
  const workspaceRegistry={get:()=>workspaceRecord};
  const bridge=createDshSemanticBridge({workspaceRegistry,sessionController:{
    projections:async()=>{workspaceRecord.sessionIds=[];return {kind:'sequenced',asOfSeq:4,values:{agentTeam:team()}};},
    prompt:async()=>{throw Error('must not prompt');},page:async()=>({records:[],hasMore:false}),
  }});
  await assert.rejects(bridge.sendLeadInstruction({workspaceId,leadSessionId:leadId,
    requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'no'}),/denied/i);
});

test('rejects mismatched Team projection, invalid limits and unknown fields',async()=>{
  const f=fixture({projection:team('other-lead')});
  await assert.rejects(f.bridge.readLeadChat({workspaceId,leadSessionId:leadId}),/denied/i);
  const g=fixture();
  await assert.rejects(g.bridge.readLeadChat({workspaceId,leadSessionId:leadId,maxMessages:1000}),/denied/i);
  await assert.rejects(g.bridge.sendLeadInstruction({workspaceId,leadSessionId:leadId,
    requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'x',mode:'steer'}),/denied/i);
});

test('retries preserve DSH prompt request id for official idempotent admission',async()=>{
  const f=fixture();
  const input={workspaceId,leadSessionId:leadId,requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'same instruction'};
  await f.bridge.sendLeadInstruction(input);await f.bridge.sendLeadInstruction(input);
  const prompts=f.calls.filter(([name])=>name==='prompt').map(([,request])=>request.requestId);
  assert.deepEqual(prompts,[input.requestId,input.requestId]);
});
