/** Server-owned, read-only exact grants on an authoritative PostgreSQL primary.
 * Missing grants never authorize. No startup regrant, cache or memory fallback.
 */
import {createHash} from 'node:crypto';
import {createScopedReadGrants} from './scoped-read-grants.mjs';
const deny=()=>{throw Error('Agent Teams read denied');};
export function createPostgresReadGrantStore({query,timeoutMs=1000}) {
  if(typeof query!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>5000)deny();
  return Object.freeze({hasReadGrant:async scope=>{
    let hash;
    try {
      // Reuse the existing exact-ID/wildcard validator, not its grant decision.
      createScopedReadGrants([scope]);
      hash=createHash('sha256').update(JSON.stringify([
        scope.principalId,scope.workspaceId,scope.leadSessionId,
      ])).digest('hex');
    }catch{deny();}
    const ctrl=new AbortController();
    let timeout;
    try{
      const result=await Promise.race([
        Promise.resolve().then(()=>query(
          'SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = $1',
          [hash],{signal:ctrl.signal,readFromPrimary:true})),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{
          ctrl.abort();reject(Error('unavailable'));
        },timeoutMs);}),
      ]);
      if(!Array.isArray(result?.rows)||result.rows.length>1)deny();
      if(result.rows.length===0)return false;
      if(typeof result.rows[0]?.allowed!=='boolean')deny();
      return result.rows[0].allowed===true;
    }catch{deny();}
    finally{clearTimeout(timeout);}
  }});
}
