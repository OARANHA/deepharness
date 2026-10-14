/** Trusted host composition only. No grants/credentials from YAML or tools. */
import {createMcpOAuthHttpGate} from './adapters/mcp-oauth-http-gate.mjs';
const deny=()=>{throw Error('Agent Teams read denied');};
export function createPersistentDshMcpReadPolicy(options) {
  if(!options||typeof options!=='object'||Array.isArray(options)||
      Object.keys(options).some(key=>![
        'discovery','issuer','resource','query','allowedOrigins',
        'allowMissingNotBefore','revocationTimeoutMs',
      ].includes(key)))deny();
  const {discovery,issuer,resource,query,allowedOrigins,
    allowMissingNotBefore=false,revocationTimeoutMs=1000}=options;
  if(typeof discovery?.get!=='function'||typeof query!=='function'||
      !Array.isArray(allowedOrigins)||typeof allowMissingNotBefore!=='boolean'||
      !Number.isInteger(revocationTimeoutMs)||revocationTimeoutMs<50||revocationTimeoutMs>5000)deny();
  // Metadata/path validation is local and starts no listener or provider call.
  createMcpOAuthHttpGate({resource,issuer,authenticateTransport:async()=>deny()});
  return Object.freeze({
    discovery,issuer,resource,query,allowedOrigins:Object.freeze([...allowedOrigins]),
    allowMissingNotBefore,revocationTimeoutMs,grantMode:'postgres',
  });
}
