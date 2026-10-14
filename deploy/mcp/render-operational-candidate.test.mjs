import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const path=new URL('./render-operational-candidate.mjs',import.meta.url);
const module=await import(path.href);
const input={issuer:'https://id.example.invalid/realms/dsh',resource:'https://mcp.example.invalid/mcp',
  clientId:'chatgpt-dsh',resourceClientId:'dsh-read-resource',tokenEndpointAuthMethod:'none',
  redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',redirectUriEvidence:'copied from MCP management',
  authorizationResponseIssuerSupported:true,backendHost:'dsh-mcp-backend',backendPort:3443,
  allowedOrigins:['https://chatgpt.com'],missingOriginPolicy:'verified-mtls-channel'};
test('disabled OAuth client reuses individual subject and exact dedicated resource without fixtures or secrets',()=>{
  const r=module.renderOperationalCandidate(input),human=r.keycloakClients[1];
  assert.equal(human.enabled,false);assert.equal(human.publicClient,true);
  assert.deepEqual(human.redirectUris,[input.redirectUri]);assert.deepEqual(human.webOrigins,[]);
  assert.equal(human.standardFlowEnabled,true);assert.equal(human.directAccessGrantsEnabled,false);
  assert.equal(human.serviceAccountsEnabled,false);assert.equal(human.attributes['pkce.code.challenge.method'],'S256');
  assert.equal(r.purpose,'initial-owner-read-canary');assert.equal(human.attributes['use.refresh.tokens'],'false');
  assert.ok(human.protocolMappers.some(x=>x.protocolMapper==='oidc-sub-mapper'));
  assert.equal(r.keycloakClients[0].attributes.resource_url,input.resource);
  assert.ok(!JSON.stringify(r).includes('__CI_GENERATED'));assert.equal(human.secret,undefined);
});
test('proxy requires OpenAI mTLS chain and exact SAN plus private backend mTLS, never caller proof headers',()=>{
  const r=module.renderOperationalCandidate(input),l=r.envoy.static_resources.listeners[0];
  assert.equal(l.bind_to_port,false);assert.equal(l.address.socket_address.address,'127.0.0.1');
  const tls=l.filter_chains[0].transport_socket.typed_config;
  assert.equal(tls.require_client_certificate,true);
  assert.equal(tls.common_tls_context.validation_context.match_typed_subject_alt_names[0].matcher.exact,'mtls.prod.connectors.openai.com');
  assert.match(tls.common_tls_context.validation_context.trusted_ca.filename,/openai-connectors-intermediate/);
  assert.ok(r.envoy.static_resources.clusters[0].transport_socket.typed_config.common_tls_context.tls_certificates.length);
  assert.equal(r.activationAllowed,false);assert.ok(r.backendPolicy.allowedOrigins.includes(r.channelOrigin));
});
test('absent Origin is mapped only in a distinct TLS-protected route; hostile present origins reach denial',()=>{
  const r=module.renderOperationalCandidate(input),routes=r.envoy.static_resources.listeners[0].filter_chains[0].filters[0].typed_config.route_config.virtual_hosts[0].routes;
  const absent=routes.filter(x=>x.match.headers?.some(h=>h.name==='origin'&&h.present_match===false));
  assert.equal(absent.length,2);
  for(const route of absent)assert.ok(route.request_headers_to_add.some(x=>x.header.key==='origin'&&x.header.value===r.channelOrigin));
  assert.equal(routes.at(-1).direct_response.status,403);
  const denied=module.renderOperationalCandidate({...input,missingOriginPolicy:'deny'});
  assert.ok(!JSON.stringify(denied.envoy).includes('"present_match":false'));
});
test('renderer rejects unknown credentials, incomplete values, wildcard redirects/origins, wrong callback and unsafe backend',()=>{
  for(const patch of [{issuer:null},{resource:null},{redirectUri:null},{clientSecret:'forbidden'},
    {resource:'http://mcp.example/mcp'},{resource:'https://deep.wandora.com.br/mcp'},
    {redirectUri:'https://evil.example/callback'},{redirectUri:'https://chatgpt.com/connector/oauth/*'},
    {redirectUriEvidence:''},{authorizationResponseIssuerSupported:false},{allowedOrigins:['*']},
    {backendHost:'evil.example.com'},{backendPort:443},{missingOriginPolicy:'allow-all'}]){
    assert.throws(()=>module.renderOperationalCandidate({...input,...patch}),/denied/);
  }
  const privateClient=module.renderOperationalCandidate({...input,tokenEndpointAuthMethod:'client_secret_basic'}).keycloakClients[1];
  assert.equal(privateClient.publicClient,false);assert.equal(privateClient.secret,undefined);
});
test('CLI emits inactive files privately, refuses overwrite and does not disclose rejected credentials',async t=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-operational-render-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'input.json'),out=join(root,'review'),exec=promisify(execFile);
  await writeFile(source,JSON.stringify(input),{mode:0o600});
  const result=await exec(process.execPath,[fileURLToPath(path),source,out]);
  assert.equal(result.stdout.trim(),'OPERATIONAL_MCP_CANDIDATE_RENDERED_INACTIVE');
  const before=await readFile(join(out,'envoy.json'),'utf8');
  assert.equal(JSON.parse(before).static_resources.listeners[0].bind_to_port,false);
  assert.equal((await stat(join(out,'envoy.json'))).mode&0o777,0o600);
  await assert.rejects(exec(process.execPath,[fileURLToPath(path),source,out]));
  assert.equal(await readFile(join(out,'envoy.json'),'utf8'),before);
  await writeFile(source,JSON.stringify({...input,clientSecret:'REJECTED_TEST_SECRET'}));
  await assert.rejects(exec(process.execPath,[fileURLToPath(path),source,join(root,'denied')]),error=>{
    assert.ok(!error.stderr.includes('REJECTED_TEST_SECRET'));return error.stderr.trim()==='Operational MCP candidate render denied';
  });
  assert.equal(existsSync(join(root,'denied')),false);
});
