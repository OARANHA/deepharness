/** CI-only proxy fixture: simulated managed-client CA, never OpenAI private keys. */
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {renderOperationalCandidate} from '../../../deploy/mcp/render-operational-candidate.mjs';
const exec=promisify(execFile);
export async function startLoopbackEnvoyProxy({certRoot,issuer,resource,origin,backendPort}){
  if(process.env.GITHUB_ACTIONS!=='true'||resource!=='https://mcp.example/mcp'||origin!=='https://client.example')throw Error('Private proxy CI only');
  const name='dsh-human-proxy-'+randomUUID();let started=false;
  const close=async()=>{
    if(started){await exec('docker',['rm','-f',name],{timeout:15000});started=false;}
  };
  try{
    const ssl=args=>execFileSync('openssl',args,{cwd:certRoot,stdio:'ignore'});
    ssl(['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout','external-root.key','-out','external-root.pem',
      '-subj','/CN=Disposable external root','-addext','basicConstraints=critical,CA:TRUE']);
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout','external-intermediate.key','-out','external-intermediate.csr',
      '-subj','/CN=Disposable managed-client intermediate']);
    await writeFile(join(certRoot,'external-intermediate.ext'),'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n');
    ssl(['x509','-req','-days','1','-in','external-intermediate.csr','-CA','external-root.pem','-CAkey','external-root.key',
      '-CAcreateserial','-out','openai-connectors-intermediate.pem','-extfile','external-intermediate.ext']);
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout','managed-client.key','-out','managed-client.csr','-subj','/CN=Disposable managed client']);
    await writeFile(join(certRoot,'managed-client.ext'),'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:mtls.prod.connectors.openai.com\nextendedKeyUsage=clientAuth\n');
    ssl(['x509','-req','-days','1','-in','managed-client.csr','-CA','openai-connectors-intermediate.pem','-CAkey','external-intermediate.key',
      '-CAcreateserial','-out','managed-client.pem','-extfile','managed-client.ext']);
    // Fixture reuse only: internal/public server trust is the disposable lab CA.
    for(const [from,to] of [['server.crt','public-server-chain.pem'],['server.key','public-server-key.pem'],
      ['ca.crt','backend-ca.pem'],['client.crt','proxy-backend-client-chain.pem'],['client.key','proxy-backend-client-key.pem']]){
      await copyFile(join(certRoot,from),join(certRoot,to));
    }
    const candidate=renderOperationalCandidate({issuer,resource,clientId:'human-proxy-fixture',resourceClientId:'read-resource-fixture',
      redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',redirectUriEvidence:'CI fixture; not real management observation',
      authorizationResponseIssuerSupported:true,tokenEndpointAuthMethod:'none',backendHost:'localhost',backendPort,
      allowedOrigins:[origin],missingOriginPolicy:'verified-mtls-channel'});
    const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
    const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
    const config=structuredClone(candidate.envoy);
    config.static_resources.listeners[0].bind_to_port=true;
    config.static_resources.listeners[0].address.socket_address.port_value=port;
    const path=join(certRoot,'human-proxy.json');await writeFile(path,JSON.stringify(config),{mode:0o600});
    const mounts=['-v',certRoot+':/run/secrets:ro'],identity=['--user',process.getuid()+':'+process.getgid(),'--entrypoint','/usr/local/bin/envoy'];
    await exec('docker',['run','--rm',...identity,'--network','none',...mounts,'envoyproxy/envoy@sha256:459f2a6404c340fe6afccd69d85527012d47f3c036765493e6f8f3113fa384de',
      '--mode','validate','-c','/run/secrets/human-proxy.json','--log-level','error'],{timeout:60000});
    // Mark before run: cleanup also covers a Docker client timeout after create.
    started=true;
    await exec('docker',['run','-d','--name',name,...identity,'--network','host','--read-only','--cap-drop','ALL',
      '--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,nosuid,nodev,size=16m',...mounts,'envoyproxy/envoy@sha256:459f2a6404c340fe6afccd69d85527012d47f3c036765493e6f8f3113fa384de',
      '-c','/run/secrets/human-proxy.json','--log-level','error'],{timeout:15000});
    assert.ok(candidate.backendPolicy.allowedOrigins.includes(candidate.channelOrigin));
    return {port,channelOrigin:candidate.channelOrigin,cert:await readFile(join(certRoot,'managed-client.pem')),
      key:await readFile(join(certRoot,'managed-client.key')),close};
  }catch{
    await close().catch(()=>{});
    throw Error('Private CI Envoy initialization denied');
  }
}
