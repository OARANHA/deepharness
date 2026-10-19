/** Trusted embedding only. Boot the official Web profile once and reuse its context.
 * No Context/SessionStore construction, listener, session creation or grants here.
 */
// Cordis 4 trace wrappers expose their implementation with this shared symbol.
// Use it solely for identity comparison; all calls retain their traced facade.
import {createDshSemanticBridge} from '../../integrations/chatgpt-mcp/adapters/dsh-semantic-bridge.mjs';
const implementation=value=>value?.[Symbol.for('cordis.original')]??value;
export async function bootExistingProfileReadHost({runProfile,environment,args,patchFiles=[],plugin,createPolicy}={}) {
  if(typeof runProfile!=='function'||typeof createPolicy!=='function'||typeof plugin?.apply!=='function'||
      !environment||typeof environment!=='object'||!Array.isArray(args)||!args.every(x=>typeof x==='string')||
      !Array.isArray(patchFiles)||!patchFiles.every(x=>typeof x==='string'))throw Error('Existing DSH host configuration denied');
  const booted=await runProfile({environment,profile:'web',args:[...args],patchFiles:[...patchFiles]});
  const ctx=booted?.ctx;
  let phase='context';
  try {
    if(typeof ctx?.provide!=='function'||typeof ctx?.plugin!=='function'||typeof ctx?.get!=='function'||
        typeof ctx?.fiber?.dispose!=='function')throw Error('Existing DSH host unavailable');
    const services=['workspaceRegistry','sessions','sessionProjections'];
    const original=services.map(key=>implementation(ctx[key]));
    const sessionController=ctx.sessionController;
    phase='services-'+original.map(value=>value?'present':'absent').join('-');
    if(original.some(value=>!value)||typeof sessionController?.projections!=='function'||
        typeof sessionController?.page!=='function'||typeof sessionController?.prompt!=='function'||ctx.get('chatgptMcpRead')!==undefined||
        ctx.get('chatgptMcpReadPolicy')!==undefined)throw Error('Existing DSH host unavailable');
    const unchanged=()=>services.every((key,i)=>implementation(ctx[key])===original[i]);
    phase='policy';
    const policy=await createPolicy(ctx);
    if(!unchanged())throw Error('Existing DSH services replaced');
    phase='provide-policy';
    ctx.provide('chatgptMcpReadPolicy',policy);
    phase='plugin-mount';
    await ctx.plugin(plugin,{endpointEnabled:false});
    phase='read-service';
    const service=ctx.get('chatgptMcpRead');
    if(!unchanged()||typeof service?.createPrivateTransport!=='function')throw Error('Existing DSH read service unavailable');
    const semanticBridge=createDshSemanticBridge({
      workspaceRegistry:ctx.workspaceRegistry,sessionController,checkHost:unchanged,
    });
    return Object.freeze({...booted,service,semanticBridge});
  } catch {
    await ctx?.fiber?.dispose?.().catch(()=>{});
    throw Error('Existing DSH read host composition denied ('+phase+')');
  }
}
