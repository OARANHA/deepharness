/** Trusted embedding only. Boot the official Web profile once and reuse its context.
 * No Context/SessionStore construction, listener, session creation or grants here.
 */
export async function bootExistingProfileReadHost({runProfile,environment,args,patchFiles=[],plugin,createPolicy}={}) {
  if(typeof runProfile!=='function'||typeof createPolicy!=='function'||typeof plugin?.apply!=='function'||
      !environment||typeof environment!=='object'||!Array.isArray(args)||!args.every(x=>typeof x==='string')||
      !Array.isArray(patchFiles)||!patchFiles.every(x=>typeof x==='string'))throw Error('Existing DSH host configuration denied');
  const booted=await runProfile({environment,profile:'web',args:[...args],patchFiles:[...patchFiles]});
  const ctx=booted?.ctx;
  try {
    if(typeof ctx?.provide!=='function'||typeof ctx?.plugin!=='function'||typeof ctx?.get!=='function'||
        typeof ctx?.fiber?.dispose!=='function')throw Error('Existing DSH host unavailable');
    const services=['workspaceRegistry','sessions','sessionProjections'];
    const original=services.map(key=>ctx[key]);
    if(original.some(value=>!value)||ctx.get('chatgptMcpRead')!==undefined||
        ctx.get('chatgptMcpReadPolicy')!==undefined)throw Error('Existing DSH host unavailable');
    const unchanged=()=>services.every((key,i)=>ctx[key]===original[i]);
    const policy=await createPolicy(ctx);
    if(!unchanged())throw Error('Existing DSH services replaced');
    ctx.provide('chatgptMcpReadPolicy',policy);
    await ctx.plugin(plugin,{endpointEnabled:false});
    const service=ctx.get('chatgptMcpRead');
    if(!unchanged()||typeof service?.createPrivateTransport!=='function')throw Error('Existing DSH read service unavailable');
    return Object.freeze({...booted,service});
  } catch {
    await ctx?.fiber?.dispose?.().catch(()=>{});
    throw Error('Existing DSH read host composition denied');
  }
}
