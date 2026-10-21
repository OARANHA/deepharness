/** Opt-in laboratory transport composition. Starts no listener.
 * Direct TLS peer verification only: proxy certificate headers are never proof.
 * Fresh stateless SDK instance per dispatch; existing service owns OAuth/grants.
 */
import {registerScopedTeamReadTool} from './register-scoped-team-read-tool.mjs';
export function createPrivateMcpHttpHandler({
 enabled=false,resource,allowedOrigins,service,McpServer,StreamableHTTPServerTransport,
 inputSchema,maxBodyBytes=16384,timeoutMs=10000,
}={}){
 const url=new URL(resource);
 if(enabled!==true||url.protocol!=='https:'||url.pathname!=='/mcp'||url.search||url.hash||url.username||url.password||
 !Array.isArray(allowedOrigins)||!allowedOrigins.length||
 allowedOrigins.some(o=>typeof o!=='string'||new URL(o).origin!==o||new URL(o).protocol!=='https:')||
 ['handleOAuthRequest','runHttpRequest','readTeam'].some(k=>typeof service?.[k]!=='function')||
 typeof McpServer!=='function'||typeof StreamableHTTPServerTransport!=='function'||!inputSchema||
 !Number.isInteger(maxBodyBytes)||maxBodyBytes<1024||maxBodyBytes>65536||
 !Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>10000)throw Error('Private MCP configuration denied');
 let active=true,busy=false,cancelCurrent;
 const origins=new Set(allowedOrigins);
 const reply=(res,status)=>{if(!res.headersSent&&!res.writableEnded)res.writeHead(status,{'cache-control':'no-store','connection':'close'}).end();else if(!res.writableEnded)res.destroy();};
 return Object.freeze({
 dispose(){active=false;cancelCurrent?.(503);},
 async handle(req,res){
  if(!active)return reply(res,503);
  const socket=req?.socket;
  if(socket?.encrypted!==true||socket.authorized!==true||
   typeof socket.getPeerCertificate!=='function'||!socket.getPeerCertificate()?.fingerprint256)return reply(res,403);
  for(const name of ['host','origin','authorization','content-length','content-type','mcp-session-id']){
   if(req.rawHeaders?.filter((v,i)=>i%2===0&&v.toLowerCase()===name).length>1)return reply(res,400);
  }
  if(req.headers?.host!==url.host)return reply(res,421);
  // Non-browser MCP clients may omit Origin. Reject every present Origin not on the exact allowlist.
  if(req.headers.origin!==undefined&&
   (typeof req.headers.origin!=='string'||!origins.has(req.headers.origin)))return reply(res,403);
  if(req.url!=='/mcp'&&req.url!=='/.well-known/oauth-protected-resource/mcp')return reply(res,404);
  if(req.headers['mcp-session-id']!==undefined)return reply(res,400);
  if(busy)return reply(res,429);
  busy=true;
  let live=true,server,transport;
  let stop;
  const stopped=new Promise(resolve=>{stop=resolve;});
  const cancelled=()=>{live=false;req.destroy();stop();};
  cancelCurrent=status=>{live=false;reply(res,status);req.destroy();stop();};
  req.once('aborted',cancelled);res.once('close',cancelled);
  const timer=setTimeout(()=>cancelCurrent?.(504),timeoutMs);
  const check=()=>{if(!active||!live||res.writableEnded)throw Error('Private MCP request denied');};
  let closing;
  const closeResources=()=>closing??=Promise.allSettled([Promise.resolve().then(()=>transport?.close()),Promise.resolve().then(()=>server?.close())]);
  const work=async()=>{
   await service.handleOAuthRequest(req,res,async()=>{
    check();
    await service.runHttpRequest(req,async()=>{
     check();
     if(req.method!=='POST')return reply(res,405);
     if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type']??''))return reply(res,415);
     const length=req.headers['content-length'];
     if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBodyBytes))return reply(res,413);
     const chunks=[];let size=0;
     for await(const chunk of req){
      check();size+=Buffer.byteLength(chunk);
      if(size>maxBodyBytes)return reply(res,413);
      chunks.push(Buffer.from(chunk));
     }
     check();
     let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(res,400);}
     server=new McpServer({name:'wandora-dsh-private-read',version:'0.1.0-lab'});
     registerScopedTeamReadTool(server,{readTeam:async args=>{
      check();const result=await service.readTeam(args);check();return result;
     }},inputSchema);
     transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
     await server.connect(transport);check();
     await transport.handleRequest(req,res,body);
    });
   });
  };
  const operation=work();
  operation.catch(()=>{});
  try{await Promise.race([operation,stopped]);}catch{reply(res,403);}
  finally{
   live=false;clearTimeout(timer);
   req.off('aborted',cancelled);res.off('close',cancelled);
   let cleanupTimer;
   await Promise.race([closeResources(),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,100);})]);
   clearTimeout(cleanupTimer);cancelCurrent=undefined;busy=false;
  }
 }
 });
}
