import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateSemanticHttpHandler,PRIVATE_DSH_SEMANTIC_PATH} from '../adapters/private-semantic-http-handler.mjs';

function openssl(cwd,args){execFileSync('openssl',args,{cwd,stdio:'ignore'});}
async function issueClient(dir,name,subject){
  openssl(dir,['req','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj',`/CN=${subject}`]);
  await writeFile(join(dir,`${name}.ext`),'extendedKeyUsage=clientAuth\nkeyUsage=digitalSignature,keyEncipherment\n');
  openssl(dir,['x509','-req','-in',`${name}.csr`,'-CA','ca.pem','-CAkey','ca.key','-CAcreateserial',
    '-out',`${name}.pem`,'-days','1','-extfile',`${name}.ext`]);
}
function send({port,ca,cert,key,body}){
  return new Promise((resolve,reject)=>{
    const request=https.request({hostname:'deepharness-mcp-backend',port,servername:'deepharness-mcp-backend',
      path:PRIVATE_DSH_SEMANTIC_PATH,method:'POST',ca,cert,key,rejectUnauthorized:true,agent:false,
      lookup:(_host,options,callback)=>{
        if(typeof options==='function'){callback=options;options={};}
        if(options?.all)callback(null,[{address:'127.0.0.1',family:4}]);
        else callback(null,'127.0.0.1',4);
      },headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
      response.on('error',reject);
    });
    request.on('error',reject);request.end(body);
  });
}

test('private semantic handler accepts only the pinned mTLS client over a real HTTPS socket',{timeout:20000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-private-handler-tls-'));
  let server;
  try{
    openssl(dir,['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem',
      '-subj','/CN=DSH private handler integration CA','-days','1']);
    openssl(dir,['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr',
      '-subj','/CN=deepharness-mcp-backend']);
    await writeFile(join(dir,'server.ext'),
      'subjectAltName=DNS:deepharness-mcp-backend\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n');
    openssl(dir,['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial',
      '-out','server.pem','-days','1','-extfile','server.ext']);
    await issueClient(dir,'trusted','Remote-Ops trusted integration client');
    await issueClient(dir,'other','Unpinned integration client');
    const ca=await readFile(join(dir,'ca.pem'));
    const trustedCert=await readFile(join(dir,'trusted.pem'));
    const trustedFingerprint=new X509Certificate(trustedCert).fingerprint256;
    const audits=[],calls=[];
    const handler=createPrivateSemanticHttpHandler({
      bridge:{sendLeadInstruction:async args=>{calls.push(args);return {accepted:true,requestId:args.requestId};}},
      clientFingerprintSha256:trustedFingerprint,audit:event=>audits.push(event),
    });
    server=https.createServer({key:await readFile(join(dir,'server.key')),
      cert:await readFile(join(dir,'server.pem')),ca,requestCert:true,rejectUnauthorized:true},
    (request,response)=>{void handler.handle(request,response);});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const {port}=server.address();
    const body=JSON.stringify({operation:'sendLeadInstruction',workspaceId:'lab',leadSessionId:'lead-lab',
      requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'synthetic mTLS canary'});
    const accepted=await send({port,ca,cert:trustedCert,key:await readFile(join(dir,'trusted.key')),body});
    assert.equal(accepted.status,200);
    assert.deepEqual(JSON.parse(accepted.body),{result:{accepted:true,requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38'}});
    assert.deepEqual(calls,[{workspaceId:'lab',leadSessionId:'lead-lab',
      requestId:'4db3b83c-5abc-4aa3-9270-9715e3d34e38',text:'synthetic mTLS canary'}]);
    assert.deepEqual(audits,[{operation:'sendLeadInstruction',outcome:'success'}]);

    const rejected=await send({port,ca,cert:await readFile(join(dir,'other.pem')),
      key:await readFile(join(dir,'other.key')),body});
    assert.equal(rejected.status,403);
    assert.equal(calls.length,1,'an unpinned peer must not reach the DSH bridge');
    assert.deepEqual(audits.at(-1),{operation:'unknown',outcome:'denied'});
    assert.doesNotMatch(JSON.stringify(audits),/synthetic mTLS canary|lead-lab/);
    handler.dispose();
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
