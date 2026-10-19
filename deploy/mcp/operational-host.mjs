/** Operator-owned composition; no credentials, grants or identity from tool args. */
import {readFile as systemReadFile} from 'node:fs/promises';
import {lookup as systemLookup} from 'node:dns/promises';
import {bootExistingProfileReadHost} from './existing-profile-host.mjs';
import {attachPrivateReadListener} from './private-read-listener.mjs';
const issuer='https://id.wandora.com.br/realms/deepharness';
const resource='https://dsh-mcp.wandora.com.br/mcp';
const origins=['https://chatgpt.com','https://chatgpt-mtls-proxy.invalid'];
export function validateOperationalHostConfig(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).some(key=>!['version','enabled','issuer','resource','backendPort','allowedOrigins','semanticBridge'].includes(key))||
      value.version!==1||value.enabled!==true||value.issuer!==issuer||value.resource!==resource||
      value.backendPort!==3443||!Array.isArray(value.allowedOrigins)||
      JSON.stringify(value.allowedOrigins)!==JSON.stringify(origins))throw Error('Operational MCP host disabled or invalid');
  let semanticBridge;
  if(value.semanticBridge!==undefined){
    const bridge=value.semanticBridge;
    if(!bridge||typeof bridge!=='object'||Array.isArray(bridge)||
       Object.keys(bridge).some(key=>!['enabled','clientFingerprintSha256'].includes(key))||
       (bridge.enabled!==false&&bridge.enabled!==true)||
       (bridge.enabled===false&&bridge.clientFingerprintSha256!==undefined)||
       (bridge.enabled===true&&!/^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(bridge.clientFingerprintSha256??'')))
      throw Error('Operational MCP semantic bridge disabled or invalid');
    semanticBridge=Object.freeze({...bridge});
  }
  return Object.freeze({...value,allowedOrigins:Object.freeze([...value.allowedOrigins]),
    ...(semanticBridge===undefined?{}:{semanticBridge})});
}
export async function startOperationalReadHost(config,deps,{readFile=systemReadFile,lookup=systemLookup,
    boot=bootExistingProfileReadHost,listen=attachPrivateReadListener}={}){
  const settings=validateOperationalHostConfig(config);
  let pool,host,poolClosing;
  const closePool=()=>poolClosing??=Promise.resolve().then(()=>pool?.end());
  try{
    const address=async name=>{
      const values=await lookup(name,{all:true,family:4});
      const found=[...new Set(values.map(value=>value.address))];
      if(found.length!==1)throw Error('Ambiguous operational address');
      return found[0];
    };
    const webAddress=await address('deepharness-web-edge');
    const backendAddress=await address('deepharness-mcp-backend');
    if(webAddress===backendAddress)throw Error('Separate operational networks required');
    const password=(await readFile('/run/secrets/mcp-runtime-db-password','utf8')).trim();
    if(!/^[0-9a-f]{64}$/.test(password))throw Error('Invalid operational secret');
    pool=new deps.Pool({host:'mcp-grants-db',port:5432,database:'dsh_mcp_grants',user:'dsh_mcp_reader',
      password,max:2,connectionTimeoutMillis:1000,idleTimeoutMillis:1000,allowExitOnIdle:true});
    pool.on('error',()=>{}); // Requests deny through their authoritative query; never log DB credentials.
    // Startup inspection is separate from the exact authorization SELECTs.
    // Each subsequent read rechecks authority on its own checked-out session.
    await deps.assertAuthoritativePgReadPool({pool});
    const query=deps.createAuthoritativePgReadQuery({pool});
    const discovery=deps.createDiscovery({issuer,discoveryUri:issuer+'/.well-known/openid-configuration',
      jwksUri:issuer+'/protocol/openid-connect/certs'});
    await discovery.get();
    host=await boot({runProfile:deps.runProfile,environment:deps.loadLayeredEnv('dsh'),
      args:['--no-open','--port','3080','--host',webAddress,'--public-url','https://deep.wandora.com.br/',
        '--trusted-host','deep.wandora.com.br'],plugin:deps.plugin,createSemanticBridge:deps.createSemanticBridge,
      createPolicy:async ctx=>{
        ctx.effect(()=>closePool);
        return deps.createPolicy({issuer,resource,discovery,query,allowedOrigins:settings.allowedOrigins,
          allowMissingNotBefore:true,revocationTimeoutMs:1000});
      }});
    const tls={key:await readFile('/run/secrets/backend-server-key.pem'),
      cert:await readFile('/run/secrets/backend-server-chain.pem'),ca:await readFile('/run/secrets/backend-ca.pem')};
    const listener=await listen({enabled:true,ctx:host.ctx,service:host.service,host:backendAddress,
      port:settings.backendPort,tls,sdk:deps.sdk,
      ...(settings.semanticBridge?.enabled===true?{semanticBridge:{
        bridge:host.semanticBridge,clientFingerprintSha256:settings.semanticBridge.clientFingerprintSha256,
        audit:event=>host.ctx.logger?.info?.('private DSH semantic request',event),
      },createSemanticHttpHandler:deps.createSemanticHttpHandler}:{})});
    return Object.freeze({...host,listener});
  }catch{
    await host?.ctx.fiber.dispose().catch(()=>{});
    await closePool().catch(()=>{});
    throw Error('Operational MCP host initialization denied');
  }
}
