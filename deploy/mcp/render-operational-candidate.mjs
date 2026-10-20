/** Render review candidates only. Never register clients, create keys or listen. */
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const deny=()=>{throw Error('Operational MCP configuration denied');};
const realm=JSON.parse(readFileSync(new URL('../../integrations/chatgpt-mcp/keycloak-lab/realm.json',import.meta.url),'utf8'));
const channelOrigin='https://chatgpt-mtls-proxy.invalid';
const type=suffix=>'type.googleapis.com/envoy.'+suffix;
const filename=name=>({filename:'/run/secrets/'+name});
const tlsCertificate=(cert,key)=>({certificate_chain:filename(cert),private_key:filename(key)});
const peer=(file,dns)=>({trusted_ca:filename(file),match_typed_subject_alt_names:[{san_type:'DNS',matcher:{exact:dns}}]});
function secureUrl(value){
  if(typeof value!=='string'||value.length>512||value.includes('*'))deny();
  let u;try{u=new URL(value);}catch{deny();}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.href!==value||!u.hostname.includes('.'))deny();
  return u;
}
export function renderOperationalCandidate(input){
  const required=['issuer','resource','clientId','resourceClientId','redirectUri','redirectUriEvidence',
    'authorizationResponseIssuerSupported','tokenEndpointAuthMethod','backendHost','backendPort','allowedOrigins','missingOriginPolicy'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!required.includes(k))||
    required.some(k=>!Object.hasOwn(input,k)))deny();
  const issuer=secureUrl(input.issuer),resource=secureUrl(input.resource),redirect=secureUrl(input.redirectUri);
  if(!/^\/realms\/[a-zA-Z0-9_-]+$/.test(issuer.pathname)||resource.pathname!=='/mcp'||
    resource.hostname==='deep.wandora.com.br'||redirect.origin!=='https://chatgpt.com'||
    !(redirect.pathname==='/connector_platform_oauth_redirect'||/^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(redirect.pathname))||
    typeof input.authorizationResponseIssuerSupported!=='boolean'||
    (redirect.pathname==='/connector_platform_oauth_redirect'&&!input.authorizationResponseIssuerSupported)||
    typeof input.redirectUriEvidence!=='string'||!input.redirectUriEvidence.trim()||input.redirectUriEvidence.length>200||
    !['none','client_secret_basic','client_secret_post'].includes(input.tokenEndpointAuthMethod)||
    !['deny','verified-mtls-channel'].includes(input.missingOriginPolicy)||
    ![input.clientId,input.resourceClientId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id))||
    input.clientId===input.resourceClientId||typeof input.backendHost!=='string'||
    !/^[a-z][a-z0-9-]{0,62}$/.test(input.backendHost)||!Number.isInteger(input.backendPort)||
    input.backendPort<1024||input.backendPort>65535||!Array.isArray(input.allowedOrigins)||!input.allowedOrigins.length||
    input.allowedOrigins.length>4||new Set(input.allowedOrigins).size!==input.allowedOrigins.length)deny();
  for(const origin of input.allowedOrigins){if(secureUrl(origin+'/').origin!==origin||origin===channelOrigin)deny();}
  const reviewed=realm.clients.find(c=>c.clientId==='mcp-pkce-human-probe');
  if(!reviewed||reviewed.protocolMappers?.length!==3||
    !reviewed.protocolMappers.some(m=>m.protocolMapper==='oidc-sub-mapper'))deny();
  const human={clientId:input.clientId,enabled:false,protocol:'openid-connect',
    publicClient:input.tokenEndpointAuthMethod==='none',clientAuthenticatorType:'client-secret',
    standardFlowEnabled:true,implicitFlowEnabled:false,directAccessGrantsEnabled:false,serviceAccountsEnabled:false,
    redirectUris:[input.redirectUri],webOrigins:[],defaultClientScopes:['basic','agent-teams:read'],optionalClientScopes:[],
    attributes:{'pkce.code.challenge.method':'S256','use.refresh.tokens':'false','access.token.lifespan':'300'},
    protocolMappers:structuredClone(reviewed.protocolMappers)};
  human.protocolMappers.find(m=>m.protocolMapper==='oidc-audience-mapper').config['included.client.audience']=input.resourceClientId;
  const resourceClient={clientId:input.resourceClientId,enabled:false,protocol:'openid-connect',publicClient:false,
    standardFlowEnabled:false,implicitFlowEnabled:false,directAccessGrantsEnabled:false,serviceAccountsEnabled:false,
    attributes:{resource_url:input.resource},redirectUris:[],webOrigins:[]};
  const routes=[];
  const route=(path,method,origin)=>({match:{path,headers:[{name:':method',string_match:{exact:method}},origin]},
    route:{cluster:'dsh_mcp_private',timeout:'10s'}});
  for(const [path,method] of [['/mcp','POST'],['/.well-known/oauth-protected-resource/mcp','GET']]){
    for(const origin of input.allowedOrigins)routes.push(route(path,method,{name:'origin',string_match:{exact:origin}}));
    if(input.missingOriginPolicy==='verified-mtls-channel'){
      const absent=route(path,method,{name:'origin',present_match:false});
      absent.request_headers_to_add=[{header:{key:'origin',value:channelOrigin},append_action:'OVERWRITE_IF_EXISTS_OR_ADD'}];
      routes.push(absent);
    }
  }
  routes.push({match:{prefix:'/'},direct_response:{status:403}});
  const envoy={static_resources:{listeners:[{name:'chatgpt_mcp_candidate',bind_to_port:false,
    address:{socket_address:{address:'127.0.0.1',port_value:8443}},filter_chains:[{
      filters:[{name:'envoy.filters.network.http_connection_manager',typed_config:{
        '@type':type('extensions.filters.network.http_connection_manager.v3.HttpConnectionManager'),
        stat_prefix:'private_mcp',forward_client_cert_details:'SANITIZE',request_timeout:'10s',stream_idle_timeout:'10s',
        route_config:{name:'mcp_only',request_headers_to_remove:['x-forwarded-client-cert','x-client-cert','x-client-verified',
          'x-forwarded-host','x-forwarded-proto','forwarded'],virtual_hosts:[{name:'mcp_exact_host',domains:[resource.host],routes}]},
        http_filters:[{name:'envoy.filters.http.buffer',typed_config:{'@type':type('extensions.filters.http.buffer.v3.Buffer'),max_request_bytes:16384}},
          {name:'envoy.filters.http.router',typed_config:{'@type':type('extensions.filters.http.router.v3.Router')}}],
      }}],transport_socket:{name:'envoy.transport_sockets.tls',typed_config:{
        '@type':type('extensions.transport_sockets.tls.v3.DownstreamTlsContext'),require_client_certificate:true,
        common_tls_context:{tls_params:{tls_minimum_protocol_version:'TLSv1_2'},
          tls_certificates:[tlsCertificate('public-server-chain.pem','public-server-key.pem')],
          validation_context:peer('openai-connectors-intermediate.pem','mtls.prod.connectors.openai.com')},
      }},
    }]}],clusters:[{name:'dsh_mcp_private',type:'STRICT_DNS',connect_timeout:'2s',
      load_assignment:{cluster_name:'dsh_mcp_private',endpoints:[{lb_endpoints:[{endpoint:{address:{socket_address:{
        address:input.backendHost,port_value:input.backendPort}}}}]}]},
      circuit_breakers:{thresholds:[{max_connections:1,max_pending_requests:1,max_requests:1,max_retries:0}]},
      transport_socket:{name:'envoy.transport_sockets.tls',typed_config:{
        '@type':type('extensions.transport_sockets.tls.v3.UpstreamTlsContext'),sni:input.backendHost,
        common_tls_context:{tls_certificates:[tlsCertificate('proxy-backend-client-chain.pem','proxy-backend-client-key.pem')],
          validation_context:peer('backend-ca.pem',input.backendHost)},
      }},
    }]}};
  envoy.static_resources.clusters[0].dns_lookup_family='V4_ONLY';
  return {activationAllowed:false,purpose:'initial-owner-read-canary',evidenceHead:'510faad337c4985bc901720702004fd0f759c26d',channelOrigin,
    oauth:{issuer:input.issuer,resource:input.resource,tokenEndpointAuthMethod:input.tokenEndpointAuthMethod,
      redirectUriEvidence:input.redirectUriEvidence,authorizationResponseIssuerSupported:input.authorizationResponseIssuerSupported},
    keycloakClients:[resourceClient,human],clientScope:structuredClone(realm.clientScopes.find(c=>c.name==='agent-teams:read')),
    backendPolicy:{issuer:input.issuer,resource:input.resource,grantMode:'postgres',tokenRevocation:'postgres-primary',
      allowedOrigins:[...input.allowedOrigins,...(input.missingOriginPolicy==='verified-mtls-channel'?[channelOrigin]:[])],
      allowMissingNotBefore:true,querySecretRef:'operator-owned-primary-pool',discovery:'operator-pinned-issuer',endpointEnabled:false},
    envoy};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==4)deny();
    const result=renderOperationalCandidate(JSON.parse(readFileSync(process.argv[2],'utf8')));
    await mkdir(process.argv[3],{recursive:false,mode:0o700});
    for(const [name,value] of [['envoy.json',result.envoy],['keycloak-clients.disabled.json',result.keycloakClients],
      ['client-scope.review.json',result.clientScope],['connection.review.json',{...result,envoy:undefined,keycloakClients:undefined,clientScope:undefined}]]){
      await writeFile(join(process.argv[3],name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
    }
    console.log('OPERATIONAL_MCP_CANDIDATE_RENDERED_INACTIVE');
  }catch{console.error('Operational MCP candidate render denied');process.exitCode=1;}
}
