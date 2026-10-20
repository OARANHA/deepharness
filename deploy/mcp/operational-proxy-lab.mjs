/** CI only: disposable certificates, loopback proxy, backend contract double. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,request} from 'node:https';
import {createServer as netServer} from 'node:net';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {renderOperationalCandidate} from './render-operational-candidate.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Disposable proxy CI only');
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'dsh-op-proxy-'));
const certs=join(root,'certs'),name='dsh-proxy-lab-'+randomUUID();
let backend;
try{
  await mkdir(certs,{mode:0o700});
  const ssl=args=>execFileSync('openssl',args,{cwd:certs,stdio:'ignore'});
  for(const ca of ['root','backend-ca','rogue'])ssl(['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-keyout',ca+'.key','-out',ca+'.pem','-subj','/CN=Disposable '+ca,'-addext','basicConstraints=critical,CA:TRUE']);
  ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout','intermediate.key','-out','intermediate.csr','-subj','/CN=Disposable connector intermediate']);
  await writeFile(join(certs,'intermediate.ext'),'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n');
  ssl(['x509','-req','-days','1','-in','intermediate.csr','-CA','root.pem','-CAkey','root.key','-CAcreateserial',
    '-out','openai-connectors-intermediate.pem','-extfile','intermediate.ext']);
  const leaf=async(label,dns,eku,ca,caKey)=>{
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',label+'-key.pem','-out',label+'.csr','-subj','/CN=Disposable '+label]);
    await writeFile(join(certs,label+'.ext'),'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:'+dns+'\nextendedKeyUsage='+eku+'\n');
    ssl(['x509','-req','-days','1','-in',label+'.csr','-CA',ca,'-CAkey',caKey,'-CAcreateserial',
      '-out',label+'-chain.pem','-extfile',label+'.ext']);
  };
  await leaf('public-server','mcp.example.invalid','serverAuth','root.pem','root.key');
  await leaf('backend-server','localhost','serverAuth','backend-ca.pem','backend-ca.key');
  await leaf('proxy-backend-client','proxy.internal','clientAuth','backend-ca.pem','backend-ca.key');
  for(const [label,dns,eku,ca,key] of [
    ['chatgpt-client','mtls.prod.connectors.openai.com','clientAuth','openai-connectors-intermediate.pem','intermediate.key'],
    ['wrong-san','evil.example.invalid','clientAuth','openai-connectors-intermediate.pem','intermediate.key'],
    ['wrong-eku','mtls.prod.connectors.openai.com','serverAuth','openai-connectors-intermediate.pem','intermediate.key'],
    ['rogue-client','mtls.prod.connectors.openai.com','clientAuth','rogue.pem','rogue.key'],
  ])await leaf(label,dns,eku,ca,key);
  const file=n=>readFile(join(certs,n));
  let backendRequests=0;const backendErrors=[];
  backend=createServer({key:await file('backend-server-key.pem'),cert:await file('backend-server-chain.pem'),
    ca:await file('backend-ca.pem'),requestCert:true,rejectUnauthorized:true},(req,res)=>{
    backendRequests++;
    if(req.socket.authorized!==true||req.headers['x-client-verified']!==undefined||req.headers['x-client-cert']!==undefined){
      backendErrors.push('backend boundary violated');return res.writeHead(500).end();
    }
    if(req.url==='/.well-known/oauth-protected-resource/mcp')return res.writeHead(200).end(JSON.stringify({resource:'https://mcp.example.invalid/mcp'}));
    if(req.headers.authorization!=='Bearer lab-valid')return res.writeHead(401).end();
    res.writeHead(200).end(JSON.stringify({origin:req.headers.origin}));
  });
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const candidate=renderOperationalCandidate({issuer:'https://id.example.invalid/realms/dsh',resource:'https://mcp.example.invalid/mcp',
    clientId:'chatgpt-dsh',resourceClientId:'dsh-read-resource',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',
    redirectUriEvidence:'CI fixture only',authorizationResponseIssuerSupported:true,tokenEndpointAuthMethod:'none',
    backendHost:'localhost',backendPort:backend.address().port,allowedOrigins:['https://chatgpt.com'],missingOriginPolicy:'verified-mtls-channel'});
  // Reserve an ephemeral loopback port. bind is enabled only in this disposable test.
  const portProbe=netServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
  const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
  const config=structuredClone(candidate.envoy),listener=config.static_resources.listeners[0];
  listener.bind_to_port=true;listener.address.socket_address.port_value=port;
  await writeFile(join(root,'envoy.json'),JSON.stringify(config));
  const mounts=['-v',root+':/review:ro','-v',certs+':/run/secrets:ro'];
  // Keep fixture permissions private: run the binary as their actual owner.
  // The image shell entrypoint otherwise drops root to its unrelated envoy UID.
  const identity=['--user',process.getuid()+':'+process.getgid(),'--entrypoint','/usr/local/bin/envoy'];
  await exec('docker',['run','--rm',...identity,'--network','none',...mounts,'envoyproxy/envoy:v1.40.0',
    '--mode','validate','-c','/review/envoy.json','--log-level','error'],{timeout:60000});
  await exec('docker',['run','-d','--name',name,...identity,'--network','host','--read-only','--cap-drop','ALL',
    '--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,nosuid,nodev,size=16m',...mounts,
    'envoyproxy/envoy:v1.40.0','-c','/review/envoy.json','--log-level','error'],{timeout:15000});
  const ca=await file('root.pem'),cert=await file('chatgpt-client-chain.pem'),key=await file('chatgpt-client-key.pem');
  const send=(headers={},tls={},path='/mcp',method='POST')=>new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,servername:'mcp.example.invalid',ca,cert,key,rejectUnauthorized:true,
      ...tls,method,path,agent:false,headers:{host:'mcp.example.invalid',authorization:'Bearer lab-valid',
        'content-type':'application/json',...headers}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString('utf8')}));
    });req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('proxy lab timeout')));req.end(method==='GET'?undefined:'{}');
  });
  let ready=false;for(let i=0;i<30;i++){
    try{if((await send()).status===200){ready=true;break;}}catch{}await delay(100);
  }assert.equal(ready,true,'proxy must actually forward after verified client/backend TLS');
  assert.equal(JSON.parse((await send()).text).origin,candidate.channelOrigin);
  assert.equal(JSON.parse((await send({origin:'https://chatgpt.com'})).text).origin,'https://chatgpt.com');
  for(const headers of [{origin:'https://evil.example'},{origin:''},{host:'evil.example' }]){
    const before=backendRequests;assert.ok([403,404].includes((await send(headers)).status));assert.equal(backendRequests,before);
  }
  for(const label of ['wrong-san','wrong-eku','rogue-client']){
    const before=backendRequests;await assert.rejects(send({}, {cert:await file(label+'-chain.pem'),key:await file(label+'-key.pem')}),
      e=>e.message!=='proxy lab timeout');assert.equal(backendRequests,before);
    assert.equal((await send()).status,200,'valid client must still work after TLS rejection');
  }
  const before=backendRequests;
  await assert.rejects(send({'x-client-verified':'true','x-client-cert':'spoof'},{cert:undefined,key:undefined}),e=>e.message!=='proxy lab timeout');
  assert.equal(backendRequests,before);
  assert.equal((await send()).status,200,'valid client must work after missing certificate rejection');
  assert.equal((await send({authorization:''})).status,401,'client mTLS must never replace user authorization');
  assert.equal((await send({'x-client-verified':'spoof','x-client-cert':'spoof'})).status,200);
  assert.equal((await send({}, {},'/unrelated')).status,403);
  assert.equal((await send({}, {},'/mcp','DELETE')).status,403);
  assert.equal((await send({authorization:''},{},'/.well-known/oauth-protected-resource/mcp','GET')).status,200);
  assert.deepEqual(backendErrors,[]);
  console.log('OPERATIONAL_PROXY_MTLS_SAN_ORIGIN_MATCH: private CI Envoy + intermediate/SAN/EKU + backend mTLS + strict Host/Origin + missing-Origin channel + OAuth still required');
}finally{
  await exec('docker',['rm','-f',name],{timeout:15000}).catch(()=>{});
  if(backend?.listening)await new Promise(resolve=>{backend.close(resolve);backend.closeAllConnections();});
  await rm(root,{recursive:true,force:true});
}
