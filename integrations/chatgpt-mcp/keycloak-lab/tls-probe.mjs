/** CI-only TLS verification; no credentials/codes/tokens. */
import assert from 'node:assert/strict';
import {get} from 'node:https';
const base=process.env.KEYCLOAK_LAB_URL??'https://127.0.0.1:18080';
assert.equal(base,'https://127.0.0.1:18080','TLS probe is loopback lab only');
const negative=process.env.KEYCLOAK_TLS_NEGATIVE==='true';
if(negative)assert.equal(process.env.NODE_EXTRA_CA_CERTS,undefined,'negative process must not trust the lab CA');
await new Promise((resolve,reject)=>{
  const req=get(base+'/realms/deepharness-mcp-lab/.well-known/openid-configuration',res=>{
    res.resume();
    if(negative){reject(Error('Untrusted laboratory certificate was accepted'));return;}
    if(res.statusCode!==200||res.socket.authorized!==true){reject(Error('Trusted laboratory TLS probe failed'));return;}
    resolve();
  });
  req.setTimeout(10000,()=>req.destroy(Error('TLS probe deadline')));
  req.on('error',error=>{
    const certificateErrors=['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT'];
    if(negative&&certificateErrors.includes(error.code))resolve();
    else reject(Error('Laboratory TLS probe failed'));
  });
});
console.log(negative?'KEYCLOAK_LAB_UNTRUSTED_CA_DENIED':'KEYCLOAK_LAB_TRUSTED_TLS_MATCH');
