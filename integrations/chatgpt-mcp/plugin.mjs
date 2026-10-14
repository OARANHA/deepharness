/** DSH/Cordis read-only plugin; mounts an internal service, never a listener.
 * Required policy is a trusted host service, not YAML credentials or MCP args.
 */
import {createOfficialDshMcpReadRuntime} from './runtime.mjs';
import {createPrivateMcpHttpHandler} from './adapters/private-mcp-http-handler.mjs';
export const name='wandora-chatgpt-mcp-read';
export const inject=['workspaceRegistry','sessions','sessionProjections','chatgptMcpReadPolicy'];
const deny=()=>{throw Error('Agent Teams read denied');};
export function apply(ctx,config={}) {
  if(!config||typeof config!=='object'||Array.isArray(config)||
      Object.keys(config).some(key=>key!=='endpointEnabled')||
      (config.endpointEnabled!==undefined&&config.endpointEnabled!==false)) deny();
  if(typeof ctx?.provide!=='function'||typeof ctx?.effect!=='function') deny();
  const policy=ctx.chatgptMcpReadPolicy;
  if(!policy||typeof policy!=='object') deny();
  // Capture the initialized Cordis facades once. Cordis owns required-service
  // injection and the plugin fiber lifetime; the runtime guards these handles.
  const host={
    workspaceRegistry:ctx.workspaceRegistry,
    sessions:ctx.sessions,
    sessionProjections:ctx.sessionProjections,
  };
  const runtime=createOfficialDshMcpReadRuntime(host,policy);
  const resource=policy.resource,allowedOrigins=[...policy.allowedOrigins];
  let active=true,transport;
  const guarded=fn=>async(...args)=>{
    if(!active)deny();
    const result=await fn(...args);
    if(!active)deny();
    return result;
  };
  ctx.effect(()=>()=>{active=false;transport?.dispose();});
  const service=Object.freeze({
    runHttpRequest:guarded(runtime.runHttpRequest),
    readTeam:guarded(runtime.readTeam),
    handleOAuthRequest:guarded(runtime.handleOAuthRequest),
    // Trusted embedding API only. Never called from YAML or MCP tool arguments.
    // The host owns TLS/listening; this factory cannot open a port.
    createPrivateTransport(options={}) {
      const keys=['enabled','McpServer','StreamableHTTPServerTransport','inputSchema','maxBodyBytes','timeoutMs'];
      if(!active||transport||!options||typeof options!=='object'||Array.isArray(options)||
        Object.keys(options).some(key=>!keys.includes(key))) deny();
      transport=createPrivateMcpHttpHandler({...options,resource,allowedOrigins,service});
      return transport;
    },
  });
  ctx.provide('chatgptMcpRead',service);
}

