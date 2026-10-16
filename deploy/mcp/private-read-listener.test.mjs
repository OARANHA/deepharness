import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
import {createServer} from 'node:net';
import {attachPrivateReadListener} from './private-read-listener.mjs';
test('disabled listener cannot invoke the transport factory',async()=>{
  let called=false;await assert.rejects(attachPrivateReadListener({service:{createPrivateTransport(){called=true;}}}),/disabled/);
  assert.equal(called,false);
});
test('wildcard binding is rejected before any transport construction',async()=>{
  await assert.rejects(attachPrivateReadListener({enabled:true,host:'0.0.0.0',port:3443}),/configuration denied/);
});
test('real mTLS rejects missing certificate; verified client reaches handler; root cleanup closes listener',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-private-listener-'));let listener;
  try {
    const ssl=args=>execFileSync('openssl',args,{cwd:root,stdio:'ignore'});
    ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Disposable Backend CA']);
    for(const name of ['server','client']){
      ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name]);
      await writeFile(join(root,name+'.ext'),name==='server'?'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n');
      ssl(['x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',name+'.crt','-days','1','-extfile',name+'.ext']);
    }
    const file=name=>readFile(join(root,name));
    const tls={key:await file('server.key'),cert:await file('server.crt'),ca:await file('ca.crt')};
    const holder=createServer();await new Promise(resolve=>holder.listen(0,'127.0.0.1',resolve));
    const port=holder.address().port;await new Promise(resolve=>holder.close(resolve));
    let calls=0,disposed=false,cleanup;
    const service={createPrivateTransport:()=>({dispose(){disposed=true;},handle(req,res){calls++;res.writeHead(204).end();}})};
    const ctx={get:()=>service,effect:callback=>{cleanup=callback();}};
    listener=await attachPrivateReadListener({enabled:true,ctx,service,host:'127.0.0.1',port,tls,sdk:{}});
    const call=options=>new Promise((resolve,reject)=>{
      const req=request({hostname:'127.0.0.1',port,path:'/mcp',agent:false,ca:tls.ca,rejectUnauthorized:true,...options},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});
      req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('timeout')));req.end();
    });
    await assert.rejects(call({}));assert.equal(calls,0);
    assert.equal(await call({key:await file('client.key'),cert:await file('client.crt')}),204);
    assert.equal(calls,1);await cleanup();assert.equal(disposed,true);
    await assert.rejects(call({key:await file('client.key'),cert:await file('client.crt')}));
    await listener.close();
  } finally {await listener?.close();await rm(root,{recursive:true,force:true});}
});
