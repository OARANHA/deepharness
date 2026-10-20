import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
const candidate=await import('../adapters/private-mcp-http-handler.mjs').catch(()=>({}));
test('transport handler implementation exists',()=>assert.equal(typeof candidate.createPrivateMcpHttpHandler,'function'));
if(candidate.createPrivateMcpHttpHandler){
const {createPrivateMcpHttpHandler}=candidate;
const fixture=()=>{
 let dispatches=0,reads=0,closed=0;
 const service={handleOAuthRequest:async(req,res,next)=>req.headers.authorization==='Bearer valid'?next():res.writeHead(401).end(),
 runHttpRequest:async(req,next)=>next(),readTeam:async()=>{reads++;return {leadSessionId:'lead'};}};
 class Server{registerTool(name,config,callback){this.callback=callback;}async connect(t){t.server=this;}async close(){closed++;}}
 class Transport{async handleRequest(req,res,body){dispatches++;if(body.method==='tools/call'){const result=await this.server.callback(body.params.arguments);res.writeHead(200).end(JSON.stringify(result));}else res.writeHead(200).end('{}');}async close(){}}
 const config={enabled:true,resource:'https://mcp.example/mcp',allowedOrigins:['https://client.example'],service,McpServer:Server,StreamableHTTPServerTransport:Transport,inputSchema:{},timeoutMs:100,maxBodyBytes:1024};
 const req=(overrides={},body='{"method":"initialize"}')=>Object.assign(Readable.from([body]),{url:'/mcp',method:'POST',headers:{host:'mcp.example',origin:'https://client.example',authorization:'Bearer valid','content-type':'application/json',...overrides},socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({fingerprint256:'trusted'})}});
 const res=()=>Object.assign(new EventEmitter(),{headersSent:false,writableEnded:false,status:0,writeHead(status){this.status=status;this.headersSent=true;return this;},end(body){this.body=body;this.writableEnded=true;this.emit('finish');return this;},destroy(){this.writableEnded=true;this.emit('close');}});
 return {config,req,res,counts:()=>({dispatches,reads,closed})};
};
test('explicit enable required',()=>{const f=fixture();assert.throws(()=>createPrivateMcpHttpHandler({...f.config,enabled:false}));});
for(const [name,mutate,status] of [
 ['no verified TLS',r=>{r.socket.encrypted=false;},403],
 ['untrusted cert',r=>{r.socket.authorized=false;},403],
 ['spoofed certificate header',r=>{r.socket.authorized=false;r.headers['x-client-cert']='trusted';},403],
 ['wrong Host',r=>{r.headers.host='evil.example';},421],
 ['evil Origin',r=>{r.headers.origin='https://evil.example';},403],
 ['missing Origin',r=>{delete r.headers.origin;},403],
 ['invalid bearer',r=>{r.headers.authorization='Bearer bad';},401],
 ['session identity reuse',r=>{r.headers['mcp-session-id']='previous';},400],
 ['unsupported method',r=>{r.method='GET';},405],
 ['oversize body',r=>{r.headers['content-length']='9999';},413],
 ['invalid JSON',r=>{},400]
]){
 test(name+' denied before SDK',async()=>{
 const f=fixture(),handler=createPrivateMcpHttpHandler(f.config),r=f.req({},name==='invalid JSON'?'bad':undefined),s=f.res();
 mutate(r);await handler.handle(r,s);assert.equal(s.status,status);assert.equal(f.counts().dispatches,0);
 });
}
test('scoped tool dispatch and close',async()=>{
 const f=fixture(),h=createPrivateMcpHttpHandler(f.config),s=f.res();
 await h.handle(f.req({},JSON.stringify({method:'tools/call',params:{arguments:{workspaceId:'w',leadSessionId:'lead'}}})),s);
 assert.equal(s.status,200);assert.equal(f.counts().reads,1);assert.equal(f.counts().closed,1);
 h.dispose();const denied=f.res();await h.handle(f.req(),denied);assert.equal(denied.status,503);
});
test('body overflow without content length denied',async()=>{const f=fixture(),s=f.res();await createPrivateMcpHttpHandler(f.config).handle(f.req({},'x'.repeat(1025)),s);assert.equal(s.status,413);assert.equal(f.counts().dispatches,0);});

test('duplicate security headers denied',async()=>{const f=fixture(),r=f.req(),s=f.res();r.rawHeaders=['Host','mcp.example','Host','mcp.example'];await createPrivateMcpHttpHandler(f.config).handle(r,s);assert.equal(s.status,400);assert.equal(f.counts().dispatches,0);});
test('timeout during authentication denies late dispatch',async()=>{
 const f=fixture();let release;f.config.service.handleOAuthRequest=async(req,res,next)=>{await new Promise(r=>release=r);await next();};
 const h=createPrivateMcpHttpHandler({...f.config,timeoutMs:50}),s=f.res(),pending=h.handle(f.req(),s);
 await new Promise(resolve=>s.once('finish',resolve));assert.equal(s.status,504);
 release();await pending;assert.equal(f.counts().dispatches,0);
});
test('concurrent request denied while first awaits auth',async()=>{
 const f=fixture();let release;f.config.service.handleOAuthRequest=async(req,res,next)=>{await new Promise(r=>release=r);await next();};
 const h=createPrivateMcpHttpHandler(f.config),pending=h.handle(f.req(),f.res());
 const denied=f.res();await h.handle(f.req(),denied);assert.equal(denied.status,429);
 release();await pending;
});
test('dispose during authentication denies late dispatch',async()=>{
 const f=fixture();let release;f.config.service.handleOAuthRequest=async(req,res,next)=>{await new Promise(r=>release=r);await next();};
 const h=createPrivateMcpHttpHandler(f.config),s=f.res(),pending=h.handle(f.req(),s);
 h.dispose();release();await pending;assert.equal(s.status,503);assert.equal(f.counts().dispatches,0);
});
test('timeout cancels stalled body and releases concurrency',async()=>{
 const f=fixture(),r=f.req();const {PassThrough}=await import('node:stream');const stalled=new PassThrough();
 Object.assign(stalled,{url:r.url,method:r.method,headers:r.headers,socket:r.socket});
 const h=createPrivateMcpHttpHandler({...f.config,timeoutMs:50}),s=f.res();
 const pending=h.handle(stalled,s);await new Promise(resolve=>s.once('finish',resolve));
 assert.equal(s.status,504);assert.equal(stalled.destroyed,true);
 await pending;const next=f.res();await h.handle(f.req(),next);assert.equal(next.status,200);
});
test('authentication that never settles cannot retain concurrency after timeout',async()=>{
 const f=fixture(),original=f.config.service.handleOAuthRequest;
 f.config.service.handleOAuthRequest=async()=>new Promise(()=>{});
 const h=createPrivateMcpHttpHandler({...f.config,timeoutMs:50}),s=f.res();
 await h.handle(f.req(),s);assert.equal(s.status,504);
 f.config.service.handleOAuthRequest=original;const next=f.res();await h.handle(f.req(),next);assert.equal(next.status,200);
});
}
