/** CI-only wire probe. JWT stays in memory; real services supplied by host probe. */
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer,request as httpsRequest} from 'node:https';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import {closePrivateWireResources} from './close-private-wire-resources.mjs';
export async function createLoopbackPrivateMcpProbe({resource,getService,bearer,origin,issuer,viaOperationalProxy=false}){
 if(process.env.GITHUB_ACTIONS!=='true'||resource!=='https://mcp.example/mcp'||
 typeof getService!=='function'||typeof bearer!=='string'||!bearer.startsWith('Bearer ')||
 origin!=='https://client.example'||typeof viaOperationalProxy!=='boolean'||(viaOperationalProxy&&typeof issuer!=='string'))throw Error('Private CI wire configuration required');
 const root=await mkdtemp(join(tmpdir(),'dsh-keycloak-wire-'));
 let http,handler,proxy;
 try{
  // Certificates/keys are ephemeral test material. OpenSSL output never logged.
  const certRoot=join(root,'certs');await (await import('node:fs/promises')).mkdir(certRoot,{mode:0o700});
  const ssl=args=>execFileSync('openssl',args,{cwd:certRoot,stdio:'ignore'});
  ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Disposable Lab CA']);
  for(const name of ['server','client']){
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name]);
    await writeFile(join(certRoot,name+'.ext'),name==='server'?'subjectAltName=DNS:mcp.example,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n');
    ssl(['x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',name+'.crt','-days','1','-extfile',name+'.ext']);
    await chmod(join(certRoot,name+'.key'),0o600);
  }
  ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','rogue.key','-out','rogue.crt','-days','1','-subj','/CN=untrusted']);
  await chmod(join(certRoot,'ca.key'),0o600);await chmod(join(certRoot,'rogue.key'),0o600);
  const file=name=>readFile(join(certRoot,name));

  let httpRequests=0;
  http=createServer({key:await file('server.key'),cert:await file('server.crt'),ca:await file('ca.crt'),
    requestCert:true,rejectUnauthorized:true},(req,res)=>{
    httpRequests++;handler.handle(req,res).catch(()=>res.destroy());
  });
  const options={enabled:true,McpServer,StreamableHTTPServerTransport,
    inputSchema:z.object({workspaceId:z.string().min(1).max(256),leadSessionId:z.string().min(1).max(256)}).strict()};
  handler=getService().createPrivateTransport(options);
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  if(viaOperationalProxy){
    const {startLoopbackEnvoyProxy}=await import('./loopback-envoy-proxy.mjs');
    proxy=await startLoopbackEnvoyProxy({certRoot,issuer,resource,origin,backendPort:http.address().port});
    assert.equal(proxy.channelOrigin,'https://chatgpt-mtls-proxy.invalid');
  }
  const ca=await file('ca.crt'),cert=proxy?.cert??await file('client.crt'),key=proxy?.key??await file('client.key');
  let id=0;
  const send=(method,params={},headers={},tls={},path='/mcp',verb='POST')=>new Promise((resolve,reject)=>{
    const req=httpsRequest({hostname:'127.0.0.1',port:proxy?.port??http.address().port,servername:'mcp.example',
      path,method:verb,agent:false,ca,cert,key,rejectUnauthorized:true,...tls,
      headers:Object.fromEntries(Object.entries({host:'mcp.example',origin,authorization:bearer,'content-type':'application/json',
        accept:'application/json, text/event-stream',...headers}).filter(([,value])=>value!==null))},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('wire timeout')));
    req.end(verb==='GET'?undefined:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}));
  });
  const close=()=>closePrivateWireResources({disposeHandler:()=>handler.dispose(),closeProxy:()=>proxy?.close(),http,root});
  if(proxy){
    let ready=false;
    for(let i=0;i<30;i++){
      try{if((await send('',{}, {authorization:''},{},'/.well-known/oauth-protected-resource/mcp','GET')).status===200){ready=true;break;}}catch{}
      await delay(100);
    }
    assert.equal(ready,true,'real proxy must forward trusted metadata over backend mTLS');
  }
  return {
    async rebind(){
      // The plugin was unloaded by mount(): do not mask a live old handler
      // by explicitly disposing it here. Prove its HTTP invalidation first.
      assert.equal((await send('tools/list')).status,503,'old plugin-owned handler must deny after unload');
      handler=getService().createPrivateTransport(options);
    },
    async assertLifecycle(){
      const before=httpRequests;let timer;
      if(proxy){
        await assert.rejects(send('tools/list',{}, {},{cert:undefined,key:undefined}),e=>e.message!=='wire timeout');
        assert.equal(httpRequests,before,'unverified caller must not reach private backend');
        assert.equal((await send('tools/list')).status,200,'valid client control must work after denied TLS');
      }else{ 
      const tlsError=new Promise((resolve,reject)=>{
        http.once('tlsClientError',(error,socket)=>resolve({error,socket}));
        timer=setTimeout(()=>reject(Error('TLS rejection absent')),2500);
      });
      try{
        await assert.rejects(send('tools/list',{}, {},{cert:undefined,key:undefined}),e=>e.message!=='wire timeout');
        const {socket,error}=await tlsError;assert.equal(socket.authorized,false);
        assert.ok(/certificate|unknown ca|verify/i.test(error.message)||['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(socket.authorizationError));
        assert.equal(httpRequests,before);
      }finally{clearTimeout(timer);}
      }
      const absent=await send('tools/list',{}, {authorization:''});
      assert.equal(absent.status,401);assert.ok(absent.headers['www-authenticate'].includes('resource_metadata'));
      if(proxy)assert.equal((await send('tools/list',{}, {authorization:'',origin:null})).status,401,'normalized Origin cannot replace bearer authentication');
      const invalid=await send('tools/list',{}, {authorization:'Bearer invalid'});
      assert.equal(invalid.status,401);
      const metadata=await send('',{}, {authorization:''},{},'/.well-known/oauth-protected-resource/mcp','GET');
      assert.equal(metadata.status,200);assert.equal(JSON.parse(metadata.text).resource,resource);
      const init=await send('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'human-wire-lab',version:'1'}});
      assert.equal(init.status,200);assert.equal(init.headers['mcp-session-id'],undefined);
      const listed=await send('tools/list');assert.equal(listed.status,200);
      assert.deepEqual(JSON.parse(listed.text).result.tools.map(t=>t.name),['dsh_read_agent_team']);
      for(const [headers,status] of [[{host:'evil.example'},proxy?404:421],[{origin:'https://evil.example'},403],[{origin:''},403],[{'mcp-session-id':'forged'},400]]){
        assert.equal((await send('tools/list',{},headers)).status,status);
      }
    },
    async read(args,authorization=bearer,{withoutOrigin=false}={}){
      const reply=await send('tools/call',{name:'dsh_read_agent_team',arguments:args},{authorization,...(withoutOrigin?{origin:null}:{})});
      if(reply.status!==200)throw Error('Agent Teams read denied');
      let result;try{result=JSON.parse(reply.text);}catch{throw Error('Agent Teams read denied');}
      if(result.error||result.result?.isError||!result.result?.content?.[0]?.text)throw Error('Agent Teams read denied');
      return JSON.parse(result.result.content[0].text);
    },
    close,
  };
 }catch{
  handler?.dispose();
  await proxy?.close().catch(()=>{});
  if(http?.listening)await new Promise(resolve=>{http.close(resolve);http.closeAllConnections();});
  await rm(root,{recursive:true,force:true});
  throw Error('Private CI wire initialization denied');
 }
}

