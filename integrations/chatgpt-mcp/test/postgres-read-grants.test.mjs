import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPostgresReadGrantStore} from '../adapters/postgres-read-grants.mjs';
import {createMcpReadRequestContext} from '../adapters/mcp-read-request-context.mjs';
import {createPersistentDshMcpReadPolicy} from '../policy.mjs';
const scope={principalId:'https://id.example#alice',workspaceId:'ws',leadSessionId:'lead'};
test('persistent grant lookup uses exact hashed tuple and authoritative primary on every check',async()=>{
  let allowed=true,calls=0;
  const store=createPostgresReadGrantStore({query:async(sql,params,opts)=>{
    calls++;assert.match(sql,/WHERE grant_hash = \$1$/);
    assert.equal(params[0],createHash('sha256').update(JSON.stringify(Object.values(scope))).digest('hex'));
    assert.equal(opts.readFromPrimary,true);assert.ok(opts.signal);
    return {rows:[{allowed}]};
  }});
  assert.equal(await store.hasReadGrant(scope),true);
  allowed=false;assert.equal(await store.hasReadGrant(scope),false);assert.equal(calls,2);
  assert.deepEqual(Object.keys(store),['hasReadGrant']);
});
test('missing, malformed, duplicate, wildcard, error and deadline grants fail closed',async()=>{
  assert.equal(await createPostgresReadGrantStore({query:async()=>({rows:[]})}).hasReadGrant(scope),false);
  for(const rows of [[{allowed:'true'}],[{allowed:true},{allowed:true}],undefined]){
    await assert.rejects(createPostgresReadGrantStore({query:async()=>({rows})}).hasReadGrant(scope),/denied/);
  }
  let calls=0;const query=async()=>{calls++;return {rows:[{allowed:true}]}};
  for(const key of Object.keys(scope)){
    await assert.rejects(createPostgresReadGrantStore({query}).hasReadGrant({...scope,[key]:'*'}),/denied/);
  }
  assert.equal(calls,0);
  await assert.rejects(createPostgresReadGrantStore({query:async()=>{throw Error('offline')}}).hasReadGrant(scope),/denied/);
  await assert.rejects(createPostgresReadGrantStore({query:()=>new Promise(()=>{}),timeoutMs:50}).hasReadGrant(scope),/denied/);
});
test('persistent request callback is exclusive and revocation across await denies before projection',async()=>{
  let granted=true,projections=0;
  const options={
    authenticateTransport:async()=>({principalId:scope.principalId,kind:'individual'}),
    hasReadGrant:async()=>granted,allowedOrigins:['https://client.example'],
    workspaceRegistry:{get:()=>({id:'ws',sessionIds:['lead']})},
    resolveLiveLeadSession:async()=>{granted=false;return {id:'lead'}},
    sessionProjections:{snapshot:()=>{projections++;return {values:{agentTeam:{members:[],tasks:[]}}}}},
  };
  assert.throws(()=>createMcpReadRequestContext({...options,grants:[scope]}),/denied/);
  const binding=createMcpReadRequestContext(options);
  assert.throws(()=>binding.replaceGrants([scope]),/denied/);
  assert.throws(()=>binding.revokeGrant(scope),/denied/);
  await assert.rejects(binding.runHttpRequest({headers:{origin:'https://client.example'}},
    ()=>binding.readTeam({workspaceId:'ws',leadSessionId:'lead'})),/denied/);
  assert.equal(projections,0);
});
test('operational policy fixes PostgreSQL mode and rejects static grant/config injection',()=>{
  const options={issuer:'https://id.example',resource:'https://mcp.example/mcp',
    discovery:{get:async()=>({})},query:async()=>({rows:[]}),allowedOrigins:['https://client.example']};
  const policy=createPersistentDshMcpReadPolicy(options);
  assert.equal(policy.grantMode,'postgres');assert.equal(policy.grants,undefined);assert.ok(Object.isFrozen(policy));
  for(const extra of [{grants:[scope]},{grantMode:'static'},{endpointEnabled:true}]){
    assert.throws(()=>createPersistentDshMcpReadPolicy({...options,...extra}),/denied/);
  }
});
