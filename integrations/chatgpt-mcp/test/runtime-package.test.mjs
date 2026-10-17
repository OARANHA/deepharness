import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createOfficialDshMcpReadRuntime } from '../runtime.mjs';
const issuer = 'https://id.example', resource = 'https://mcp.example/mcp';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function signed(subject = 'alice', scope = 'agent-teams:read') {
  const now = Math.floor(Date.now() / 1000);
  const data = encode({ alg:'RS256',kid:'test',typ:'JWT' }) + '.' +
    encode({iss:issuer,aud:resource,sub:subject,jti:'test-token',iat:now,nbf:now,exp:now+300,token_use:'access',scope});
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
}
function setup() {
  let revoked = false, offline = false, snapshots = 0;
  const lead = {id:'lead'};
  const host = {
    workspaceRegistry:{get:id=>id==='ws'?{id,sessionIds:['lead','other']}:undefined},
    sessions:{get:id=>id==='lead'?lead:undefined},
    sessionProjections:{snapshot:()=>{snapshots++;return {values:{agentTeam:{
      members:[{id:'lead',name:'lead',role:'lead',phase:'active'}],tasks:[]}}};}},
  };
  const config = {
    issuer,resource,
    discovery:{get:async()=>({issuer,publicKeys:{test:{...publicKey.export({format:'jwk'}),alg:'RS256'}}})},
    query:async()=>{if(offline)throw Error('offline');return {rows:revoked?[{revoked:true}]:[]};},
    grants:[{principalId:issuer+'#alice',workspaceId:'ws',leadSessionId:'lead'}],
    allowedOrigins:['https://client.example'],
  };
  const runtime = createOfficialDshMcpReadRuntime(host,config);
  const read = (token=signed(),args={workspaceId:'ws',leadSessionId:'lead'}) => runtime.runHttpRequest({
    headers:{authorization:'Bearer '+token,origin:'https://client.example'},
  },()=>runtime.readTeam(args));
  return {host,config,runtime,read,revoke:()=>{revoked=true},offline:()=>{offline=true},snapshots:()=>snapshots};
}
test('runtime exports no listener, agent writes or grant mutation and requires authoritative config',()=>{
  const {host,config,runtime}=setup();
  assert.deepEqual(Object.keys(runtime).sort(),['handleOAuthRequest','readTeam','runHttpRequest']);
  for(const key of ['query','discovery','issuer','grants','allowedOrigins']){
    assert.throws(()=>createOfficialDshMcpReadRuntime(host,{...config,[key]:undefined}),/denied/);
  }
});
test('runtime composes signed individual, exact grants and fail-closed primary revocation',async()=>{
  const f=setup();
  assert.equal((await f.read()).leadSessionId,'lead');
  const before=f.snapshots();
  await assert.rejects(f.read(signed('bob')),/denied/);
  await assert.rejects(f.read(signed(),{workspaceId:'ws',leadSessionId:'other',principalId:issuer+'#alice'}),/denied/);
  await assert.rejects(f.read(signed('alice','wrong')),/denied/);
  assert.equal(f.snapshots(),before);
  f.revoke();await assert.rejects(f.read(),/denied/);
  const g=setup();g.offline();await assert.rejects(g.read(),/denied/);
  await assert.rejects(g.runtime.readTeam({workspaceId:'ws',leadSessionId:'lead'}),/denied/);
});
test('runtime keeps host replacement and independently selected issuer guards',async()=>{
  const f=setup();f.host.sessions={get:()=>({id:'lead'})};
  await assert.rejects(f.read(),/denied/);
  const g=setup();
  g.config.discovery.get=async()=>({issuer:'https://other.example',publicKeys:{}});
  await assert.rejects(g.read(),/denied/);
});

test('operational runtime reads durable grant every time and never accepts static fallback',async()=>{
  const {createPersistentDshMcpReadPolicy}=await import('../policy.mjs');
  const f=setup();let allowed=false,checks=0;
  const {grants,...options}=f.config;
  const policy=createPersistentDshMcpReadPolicy({...options,query:async sql=>{
    if(sql.includes('chatgpt_mcp_read_grants')){checks++;return {rows:[{allowed}]};}
    return {rows:[]};
  }});
  assert.throws(()=>createOfficialDshMcpReadRuntime(f.host,{...policy,grants:[]}),/denied/);
  const runtime=createOfficialDshMcpReadRuntime(f.host,policy);
  const read=()=>runtime.runHttpRequest({
    headers:{authorization:'Bearer '+signed(),origin:'https://client.example'},
  },()=>runtime.readTeam({workspaceId:'ws',leadSessionId:'lead'}));
  await assert.rejects(read(),/denied/);
  allowed=true;assert.equal((await read()).leadSessionId,'lead');
  const previous=checks;allowed=false;await assert.rejects(read(),/denied/);
  assert.ok(checks>previous,'revoked grant must be re-read instead of cached');
});

test('JWT expiring while authoritative revocation is awaited must be denied',async()=>{
  const {createPinnedJwtTransportAuthenticator}=await import('../adapters/pinned-jwt-transport-authenticator.mjs');
  let now=1000;
  const body=encode({alg:'RS256',kid:'test',typ:'JWT'})+'.'+encode({iss:issuer,aud:resource,
    sub:'alice',jti:'async-expiry',iat:1000,nbf:1000,exp:1001,token_use:'access',scope:'agent-teams:read'});
  const jwt=body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  const authenticate=createPinnedJwtTransportAuthenticator({issuer,audience:resource,
    publicKeys:{test:{...publicKey.export({format:'jwk'}),alg:'RS256'}},requiredScope:'agent-teams:read',
    now:()=>now,isRevoked:async()=>{now=1002;return false;}});
  await assert.rejects(authenticate({headers:{authorization:'Bearer '+jwt}}),/denied/);
});
