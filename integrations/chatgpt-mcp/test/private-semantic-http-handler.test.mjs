import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateSemanticHttpHandler} from '../adapters/private-semantic-http-handler.mjs';

const fingerprint='aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99';
function req(body,{authorized=true,peer=fingerprint,url='/wandora/dsh-bridge/v1',method='POST',headers={'content-type':'application/json'}}={}) {
  return {url,method,headers,socket:{authorized,getPeerCertificate:()=>({fingerprint256:peer})},
    async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
}
function response() { return {status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;return this;},
  end(value=''){this.body+=value;this.writableEnded=true;},destroy(){this.destroyed=true;}}; }
function handler(bridge={},audit=()=>{}) {
  return createPrivateSemanticHttpHandler({bridge,clientFingerprintSha256:fingerprint,audit});
}

test('requires the exact mutually authenticated pinned client certificate',async()=>{
  const h=handler({listTeams:async()=>[]});
  for(const request of [req({operation:'listTeams',workspaceId:'w'},{authorized:false}),
    req({operation:'listTeams',workspaceId:'w'},{peer:'00:00'}),
    req({operation:'listTeams',workspaceId:'w'},{authorized:false,headers:{'content-type':'application/json','x-client-cert':fingerprint}})]) {
    const res=response();await h.handle(request,res);assert.equal(res.status,403);assert.equal(res.body,'');
  }
});

test('dispatches only the exact semantic operation allowlist and audits without request content',async()=>{
  const audits=[],calls=[];
  const h=handler({listTeams:async input=>{calls.push(input);return [{leadSessionId:'l'}];}},event=>audits.push(event));
  const res=response();await h.handle(req({operation:'listTeams',workspaceId:'w'}),res);
  assert.equal(res.status,200);assert.deepEqual(JSON.parse(res.body),{result:[{leadSessionId:'l'}]});
  assert.deepEqual(calls,[{workspaceId:'w'}]);assert.deepEqual(audits,[{operation:'listTeams',outcome:'success'}]);
  const denied=response();await h.handle(req({operation:'shell',command:'secret'}),denied);
  assert.equal(denied.status,400);assert.deepEqual(audits.at(-1),{operation:'unknown',outcome:'denied'});
});

test('rejects wrong path, wrong verb and oversized or malformed requests',async()=>{
  const h=handler();
  for(const request of [req({operation:'listTeams',workspaceId:'w'},{url:'/mcp'}),
    req({operation:'listTeams',workspaceId:'w'},{method:'GET'}),
    req({operation:'listTeams',workspaceId:'w'},{headers:{'content-type':'text/plain'}}),
    {...req({operation:'listTeams',workspaceId:'w'}),async *[Symbol.asyncIterator](){yield Buffer.from('{bad json');}}]) {
    const res=response();await h.handle(request,res);assert.equal(res.status,400);
  }
  const large={url:'/wandora/dsh-bridge/v1',method:'POST',headers:{'content-type':'application/json'},
    socket:{authorized:true,getPeerCertificate:()=>({fingerprint256:fingerprint})},
    async *[Symbol.asyncIterator](){yield Buffer.alloc(17_000,97);}};
  const tooBig=response();await h.handle(large,tooBig);assert.equal(tooBig.status,413);
});
