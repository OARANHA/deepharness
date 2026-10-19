/** Fixed, service-to-service JSON protocol for the isolated DSH private mTLS listener. */
export const PRIVATE_DSH_SEMANTIC_PATH='/wandora/dsh-bridge/v1';
const PATH=PRIVATE_DSH_SEMANTIC_PATH,MAX_BODY_BYTES=16_384,MAX_RESPONSE_BYTES=262_144;
const deny=()=>{throw Error('Private DSH semantic request denied');};
const normalizeFingerprint=value=>typeof value==='string'?value.replaceAll(':','').toLowerCase():'';
const validFingerprint=value=>/^[0-9a-f]{64}$/.test(normalizeFingerprint(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>key==='maxMessages'||Object.hasOwn(value,key));
const schemas={
  listTeams:{keys:['workspaceId'],method:'listTeams'},
  getTeamStatus:{keys:['workspaceId','leadSessionId'],method:'getTeamStatus'},
  listTasks:{keys:['workspaceId','leadSessionId'],method:'listTasks'},
  readLeadChat:{keys:['workspaceId','leadSessionId','maxMessages'],method:'readLeadChat'},
  sendLeadInstruction:{keys:['workspaceId','leadSessionId','requestId','text'],method:'sendLeadInstruction'},
};

export function createPrivateSemanticHttpHandler({bridge,clientFingerprintSha256,maxBodyBytes=MAX_BODY_BYTES,audit=()=>{}}={}) {
  if(!object(bridge)||!validFingerprint(clientFingerprintSha256)||
     !Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>MAX_BODY_BYTES||typeof audit!=='function')deny();
  const peerFingerprint=normalizeFingerprint(clientFingerprintSha256);
  let disposed=false;
  const record=(operation,outcome)=>{try{audit(Object.freeze({operation,outcome}));}catch{}};
  async function body(req) {
    const chunks=[];let size=0;
    for await(const chunk of req) {
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      size+=bytes.length;if(size>maxBodyBytes)throw Object.assign(Error('too large'),{status:413});
      chunks.push(bytes);
    }
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw Object.assign(Error('invalid json'),{status:400});}
  }
  async function handle(req,res) {
    let operation='unknown',outcome='denied';
    try {
      const cert=req?.socket?.getPeerCertificate?.();
      if(disposed||req?.socket?.authorized!==true||normalizeFingerprint(cert?.fingerprint256)!==peerFingerprint) {
        res.writeHead(403).end();return;
      }
      if(req.method!=='POST'||req.url!==PATH||
         typeof req.headers?.['content-type']!=='string'||
         !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'])||
         req.headers?.['content-encoding']!==undefined) {
        res.writeHead(400).end();return;
      }
      req.setTimeout?.(10_000,()=>req.destroy?.());
      const input=await body(req);
      operation=typeof input?.operation==='string'&&Object.hasOwn(schemas,input.operation)?input.operation:'unknown';
      const schema=schemas[operation];
      if(!schema||!exact(input,['operation',...schema.keys]))throw Object.assign(Error('denied'),{status:400});
      const method=bridge[schema.method];
      if(typeof method!=='function')throw Object.assign(Error('denied'),{status:404});
      const args=Object.fromEntries(schema.keys.filter(key=>key!=='maxMessages'||Object.hasOwn(input,key)).map(key=>[key,input[key]]));
      const result=await method(args);
      if(disposed)throw Object.assign(Error('disposed'),{status:503});
      const serialized=JSON.stringify({result});
      if(typeof serialized!=='string'||Buffer.byteLength(serialized)>MAX_RESPONSE_BYTES)throw Object.assign(Error('response too large'),{status:502});
      outcome='success';res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(serialized);
    } catch(error) {
      const status=error?.status===413?413:error?.status===503?503:error?.status===404?404:error?.status===502?502:error?.status===400?400:502;
      outcome=status===400||status===413?'denied':'failure';
      if(!res.headersSent&&!res.writableEnded)res.writeHead(status).end();
      else if(!res.writableEnded)res.destroy?.();
    } finally { record(operation,outcome); }
  }
  return Object.freeze({handle,dispose(){disposed=true;}});
}
