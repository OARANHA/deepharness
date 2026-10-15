/** Disposable CI only: actual operational composition, official Web host and primary. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {request} from 'node:https';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.DSH_MCP_INSTALL_PROOF!=='true')throw Error('Disposable CI required');
console.log('OPERATIONAL_CI_STAGE offline installer');
await import('../verify-disabled-mcp-profile.mjs');
console.log('OPERATIONAL_CI_STAGE dependency imports');
const dependencies=createRequire('/opt/wandora-mcp-host/package.json');
const official=createRequire('/opt/dsh/node_modules/@deepseek-ai/dsh/package.json');
const installed=createRequire('/data/dsh/profiles/web/package.json');
const imported=async(resolve,name)=>import(pathToFileURL(resolve.resolve(name)).href);
const {runProfile}=await imported(official,'@deepseek-ai/dsh/profile-boot');
const {loadLayeredEnv}=await imported(official,'@deepseek-ai/dsh-app-boot');
// Shipped Web profiles intentionally leave Agent Teams off. This disposable
// canary explicitly composes the shipped opt-in bundle, without replacing services.
const teamPatch=official.resolve('@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml');
const runTeamProfile=options=>runProfile({...options,patchFiles:[...options.patchFiles,teamPatch]});
const plugin=await imported(installed,'@wandora/deepharness-chatgpt-mcp-read/plugin');
const {createPersistentDshMcpReadPolicy:createPolicy}=await imported(installed,'@wandora/deepharness-chatgpt-mcp-read/policy');
const {Pool}=dependencies('pg');
const {McpServer}=await imported(dependencies,'@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=await imported(dependencies,'@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z}=await imported(dependencies,'zod');
const {startOperationalReadHost}=await import('./operational-host.mjs');
const issuer='https://id.wandora.com.br/realms/deepharness',resource='https://dsh-mcp.wandora.com.br/mcp';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig'};
const now=Math.floor(Date.now()/1000),claims={iss:issuer,aud:resource,sub:'disposable-owner',jti:'disposable-token',
  iat:now,exp:now+300,token_use:'access',scope:'agent-teams:read'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned=encode({alg:'RS256',typ:'JWT',kid:'disposable'})+'.'+encode(claims);
const bearer=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');
const admin=new Pool({host:'mcp-grants-db',user:'dsh_mcp_owner',database:'dsh_mcp_grants',password:'a'.repeat(64),max:1});
let host,phase='start';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
try{
  console.log('OPERATIONAL_CI_STAGE start operational host');
  host=await startOperationalReadHost({version:1,enabled:true,issuer,resource,backendPort:3443,
    allowedOrigins:['https://chatgpt.com','https://chatgpt-mtls-proxy.invalid']},
    {runProfile:runTeamProfile,loadLayeredEnv,plugin,createPolicy,Pool,
      // Fixture signer only. Real production discovery is independently probed from 28server.
      createDiscovery:()=>({get:async()=>({issuer,publicKeys:{disposable:jwk}})}),
      sdk:{McpServer,StreamableHTTPServerTransport,inputSchema:z.object({workspaceId:z.string(),leadSessionId:z.string()}).strict()}});
  phase='official persisted session';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  const lead=host.ctx.sessions.create('operational-ci-lead',{meta:{cwd:'/workspace'}});
  phase='create official workspace';console.log('OPERATIONAL_CI_STAGE '+phase);
  const workspace=await host.ctx.workspaceRegistry.create('/workspace');
  phase='attach official lead';console.log('OPERATIONAL_CI_STAGE '+phase);
  await workspace.attachSession(lead.id);
  phase='snapshot official team projection';console.log('OPERATIONAL_CI_STAGE '+phase);
  const baseline=host.ctx.sessionProjections.snapshot(lead,['agentTeam']).values.agentTeam;
  assert.ok(baseline,'official Web profile must have its real Agent Team projection');
  const target={workspaceId:workspace.id,leadSessionId:lead.id};
  const grantHash=createHash('sha256').update(JSON.stringify([issuer+'#'+claims.sub,workspace.id,lead.id])).digest('hex');
  const ca=await readFile('/run/secrets/backend-ca.pem'),key=await readFile('/ci/client.key'),cert=await readFile('/ci/client.crt');
  const call=(body,{authenticated=true,clientCertificate=true,origin='https://chatgpt.com',method='POST',path='/mcp'}={})=>new Promise((resolve,reject)=>{
    const req=request({hostname:'deepharness-mcp-backend',port:3443,servername:'deepharness-mcp-backend',path,method,
      ca,rejectUnauthorized:true,agent:false,...(clientCertificate?{key,cert}:{}),headers:{host:'dsh-mcp.wandora.com.br',origin,
        accept:'application/json, text/event-stream','content-type':'application/json',...(authenticated?{authorization:'Bearer '+bearer}:{})}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,text}));
    });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('CI request timeout')));req.end(body?JSON.stringify(body):undefined);
  });
  let sequence=0;
  const read=async()=>{
    const response=await call({jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name:'dsh_read_agent_team',arguments:target}});
    assert.equal(response.status,200);const rpc=JSON.parse(response.text);
    assert.equal(rpc.error,undefined);assert.notEqual(rpc.result?.isError,true);
    return JSON.parse(rpc.result.content[0].text);
  };
  const denied=async()=>{
    const response=await call({jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name:'dsh_read_agent_team',arguments:target}});
    if(response.status===200){const rpc=JSON.parse(response.text);assert.ok(rpc.error||rpc.result?.isError===true);}
    else assert.ok([401,403].includes(response.status));
  };
  phase='missing client certificate';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  await assert.rejects(call(undefined,{clientCertificate:false}));
  phase='oauth challenge';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  assert.equal((await call(undefined,{authenticated:false})).status,401);
  phase='origin fence';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  assert.equal((await call(undefined,{origin:'https://untrusted.invalid'})).status,403);
  phase='protected resource metadata';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  const metadata=await call(undefined,{authenticated:false,method:'GET',path:'/.well-known/oauth-protected-resource/mcp'});
  assert.equal(metadata.status,200);assert.equal(JSON.parse(metadata.text).resource,resource);
  phase='authenticated tool listing';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  const tools=await call({jsonrpc:'2.0',id:++sequence,method:'tools/list',params:{}});
  assert.equal(tools.status,200);assert.deepEqual(JSON.parse(tools.text).result.tools.map(tool=>tool.name),['dsh_read_agent_team']);
  phase='ungranted read';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());await denied();
  phase='exact provisioned grant';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  await admin.query('INSERT INTO chatgpt_mcp_read_grants (grant_hash,allowed) VALUES ($1,TRUE)',[grantHash]);
  const result=await read();assert.equal(result.leadSessionId,lead.id);assert.deepEqual(result.members,baseline.members);
  phase='grant revocation';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  await admin.query('UPDATE chatgpt_mcp_read_grants SET allowed=FALSE WHERE grant_hash=$1',[grantHash]);await denied();
  await admin.query('UPDATE chatgpt_mcp_read_grants SET allowed=TRUE WHERE grant_hash=$1',[grantHash]);
  assert.equal((await read()).leadSessionId,lead.id,'healthy control before token revocation');
  phase='token revocation';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());
  const tokenHash=createHash('sha256').update(JSON.stringify([issuer,claims.sub,claims.jti])).digest('hex');
  await admin.query('INSERT INTO chatgpt_mcp_token_revocations (token_hash,revoked) VALUES ($1,TRUE)',[tokenHash]);await denied();
  phase='root disposal';console.log('OPERATIONAL_CI_STAGE '+phase.toLowerCase());await host.ctx.fiber.dispose();host=undefined;await assert.rejects(call(undefined));
  console.log('MCP_OPERATIONAL_HOST_PRIMARY_MTLS_MATCH: real operational launcher + official Web services + real restricted reader + mTLS/OAuth + sole tool + exact grant + revocations + disposal; disposable signer only');
}catch(error){
  // Emit before official root teardown, which can itself terminate this process.
  console.error('Operational integration failed at '+phase);
  const description=String(error?.message??'');
  if(description.length<=500&&!/https?:\/\/|token|passphrase|password|secret|authorization|bearer|cookie|PRIVATE KEY|[A-Za-z0-9+/_=-]{80}/i.test(description))console.error('Operational CI exception '+description);
  if(error?.name==='AssertionError'&&typeof error.actual==='number'&&typeof error.expected==='number')console.error('Operational CI status expected '+error.expected+' actual '+error.actual);
  const safeCodes=['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN','EACCES','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED'];
  if(safeCodes.includes(error?.code))console.error('Operational CI error code '+error.code);
  const detail=error?.name==='AssertionError'?'ASSERTION':error?.message==='Operational MCP host initialization denied'?'STARTUP_DENIED':'INTERNAL';
  throw Error('Operational integration failed at '+phase+' ('+detail+')');
}finally{await host?.ctx.fiber.dispose();await admin.end();}
