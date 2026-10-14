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
      Object.keys(value).some(key=>!['version','enabled','issuer','resource','backendPort','allowedOrigins'].includes(key))||
      value.version!==1||value.enabled!==true||value.issuer!==issuer||value.resource!==resource||
      value.backendPort!==3443||!Array.isArray(value.allowedOrigins)||
      JSON.stringify(value.allowedOrigins)!==JSON.stringify(origins))throw Error('Operational MCP host disabled or invalid');
  return Object.freeze({...value,allowedOrigins:Object.freeze([...value.allowedOrigins])});
}
const databaseCheck=`SELECT current_user AS role, pg_is_in_recovery() AS replica,
  has_table_privilege(current_user,'public.chatgpt_mcp_read_grants','SELECT') AS grants_read,
  has_table_privilege(current_user,'public.chatgpt_mcp_token_revocations','SELECT') AS revocations_read,
  has_table_privilege(current_user,'public.chatgpt_mcp_read_grants','INSERT,UPDATE,DELETE,TRUNCATE') AS grants_write,
  has_table_privilege(current_user,'public.chatgpt_mcp_token_revocations','INSERT,UPDATE,DELETE,TRUNCATE') AS revocations_write`;
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
    const query=(sql,params)=>pool.query(sql,params);
    const result=await query(databaseCheck);
    const row=result?.rows?.[0];
    if(result?.rows?.length!==1||row.role!=='dsh_mcp_reader'||row.replica!==false||
        row.grants_read!==true||row.revocations_read!==true||row.grants_write!==false||row.revocations_write!==false)
      throw Error('Operational primary or role denied');
    const discovery=deps.createDiscovery({issuer,discoveryUri:issuer+'/.well-known/openid-configuration',
      jwksUri:issuer+'/protocol/openid-connect/certs'});
    await discovery.get();
    host=await boot({runProfile:deps.runProfile,environment:deps.loadLayeredEnv('dsh'),
      args:['--no-open','--port','3080','--host',webAddress,'--public-url','https://deep.wandora.com.br/',
        '--trusted-host','deep.wandora.com.br'],plugin:deps.plugin,
      createPolicy:async ctx=>{
        ctx.effect(()=>closePool);
        return deps.createPolicy({issuer,resource,discovery,query,allowedOrigins:settings.allowedOrigins,
          allowMissingNotBefore:true,revocationTimeoutMs:1000});
      }});
    const tls={key:await readFile('/run/secrets/backend-server-key.pem'),
      cert:await readFile('/run/secrets/backend-server-chain.pem'),ca:await readFile('/run/secrets/backend-ca.pem')};
    const listener=await listen({enabled:true,ctx:host.ctx,service:host.service,host:backendAddress,
      port:settings.backendPort,tls,sdk:deps.sdk});
    return Object.freeze({...host,listener});
  }catch{
    await host?.ctx.fiber.dispose().catch(()=>{});
    await closePool().catch(()=>{});
    throw Error('Operational MCP host initialization denied');
  }
}
