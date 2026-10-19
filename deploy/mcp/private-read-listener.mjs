/** Trusted host adapter. Never called from YAML expressions or MCP arguments. */
import {createServer} from 'node:https';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';
import {createPrivateSemanticHttpHandler,PRIVATE_DSH_SEMANTIC_PATH} from '../../integrations/chatgpt-mcp/adapters/private-semantic-http-handler.mjs';
export async function attachPrivateReadListener({enabled=false,ctx,service,host,port,tls,sdk,semanticBridge}={}) {
  if(enabled!==true)throw Error('Private MCP listener disabled');
  if(isIP(host)!==4||host==='0.0.0.0'||!Number.isInteger(port)||port<1024||port>65535||
      typeof ctx?.effect!=='function'||typeof ctx?.get!=='function'||ctx.get('chatgptMcpRead')!==service||
      typeof service?.createPrivateTransport!=='function'||!tls||typeof tls!=='object'||
      Object.keys(tls).some(key=>!['key','cert','ca'].includes(key))||
      !['key','cert','ca'].every(key=>typeof tls[key]==='string'||Buffer.isBuffer(tls[key]))||
      !sdk||typeof sdk!=='object'||Object.keys(sdk).some(key=>!['McpServer','StreamableHTTPServerTransport','inputSchema'].includes(key))) {
    throw Error('Private MCP listener configuration denied');
  }
  let assigned=host==='127.0.0.1';
  if(!assigned){
    try{assigned=Object.values(networkInterfaces()).flat().some(item=>item?.address===host);}
    catch{throw Error('Private MCP bind address verification denied');}
  }
  if(!assigned)throw Error('Private MCP listener configuration denied');
  let server,handler,semanticHandler,closed=false,closing;
  const semanticOptions=semanticBridge;
  if(semanticOptions!==undefined&&(!semanticOptions||typeof semanticOptions!=='object'||
      Object.keys(semanticOptions).some(key=>!['bridge','clientFingerprintSha256','audit'].includes(key))||
      typeof semanticOptions.bridge!=='object'||typeof semanticOptions.clientFingerprintSha256!=='string'||
      (semanticOptions.audit!==undefined&&typeof semanticOptions.audit!=='function'))) {
    throw Error('Private DSH semantic configuration denied');
  }
  const sockets=new Set();
  const close=()=>closing??=(async()=>{
    closed=true;
    handler?.dispose();
    semanticHandler?.dispose();
    for(const socket of sockets)socket.destroy();
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
  })();
  try {
    handler=service.createPrivateTransport({enabled:true,...sdk});
    if(semanticOptions)semanticHandler=createPrivateSemanticHttpHandler(semanticOptions);
    server=createServer({...tls,minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true},(req,res)=>{
      if(closed||ctx.get('chatgptMcpRead')!==service){res.writeHead(503).end();return;}
      const selected=semanticHandler&&req.url===PRIVATE_DSH_SEMANTIC_PATH?semanticHandler:handler;
      Promise.resolve().then(()=>selected.handle(req,res)).catch(()=>res.destroy());
    });
    server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    // Register cleanup before binding: root disposal owns even startup races.
    ctx.effect(()=>close);
    await new Promise((resolve,reject)=>{
      const failed=()=>reject(Error('Private MCP listener bind denied'));
      server.once('error',failed);
      server.listen({host,port,exclusive:true},()=>{
        server.off('error',failed);
        if(closed){server.close(()=>{});reject(Error('Private MCP listener disposed'));return;}
        resolve();
      });
    });
    server.on('error',()=>{void close();});
    return Object.freeze({close,address:()=>server.address()});
  } catch {
    await close();
    throw Error('Private MCP listener initialization denied');
  }
}
