#!/usr/bin/env python3
"""Stage C read-only effective Compose gate; prints only fixed result markers."""
import json, os, pathlib, subprocess, sys

stage=pathlib.Path(__file__).resolve().parent/'portainer-stack.stage-c.review.yml'
env={k:v for k,v in os.environ.items() if k not in {
    'COMPOSE_PROFILES','COMPOSE_FILE','DSH_BASIC_AUTH_USERS','DEEPHARNESS_IMAGE',
    'DSH_MCP_HOST_IMAGE','DSH_MCP_PROXY_IMAGE','DSH_MCP_GRANTS_IMAGE',
    'DSH_MCP_REVIEW_ROOT','DSH_MCP_SECRET_ROOT'}}
env.update({
 'COMPOSE_PROFILES':'',
 'DSH_BASIC_AUTH_USERS':'__DUMMY_NEVER_DEPLOY__',
 'DEEPHARNESS_IMAGE':'example.invalid/original:review',
 'DSH_MCP_HOST_IMAGE':'ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f',
 'DSH_MCP_PROXY_IMAGE':'ghcr.io/oaranha/wandora-envoy@sha256:9a24a2c5b3304936563440ab9b2274fb9e6fa45d3c95f5966fd498c235a8a877',
 'DSH_MCP_GRANTS_IMAGE':'ghcr.io/oaranha/deepharness-grants@sha256:6279a36d7cd94b7309e38b2931de38dd4f07bb84a5440e1b6433203587725210',
 'DSH_MCP_REVIEW_ROOT':'/opt/wandora/data/deepharness-mcp/review',
 'DSH_MCP_SECRET_ROOT':'/opt/wandora/data/deepharness-mcp/tls',
})
def check(value,code):
 if not value: raise RuntimeError(code)
try:
 result=subprocess.run(['docker','compose','-f',str(stage),'config','--format','json'],
  text=True,capture_output=True,env=env,timeout=35)
 # Do not print Compose stderr/stdout: resolved labels can contain user-controlled values.
 check(result.returncode==0,'COMPOSE_RENDER_FAILED')
 c=json.loads(result.stdout)
 sv=c['services']
 check(set(sv)=={'web','mcp-grants-db'},'UNEXPECTED_SERVICES')
 w=sv['web']; db=sv['mcp-grants-db']
 check(str(w.get('user'))=='1000:1000','WEB_UID_MISMATCH')
 check(str(db.get('user'))=='999:999','DB_UID_MISMATCH')
 check(w['image']==env['DSH_MCP_HOST_IMAGE'] and db['image']==env['DSH_MCP_GRANTS_IMAGE'],'IMAGE_MISMATCH')
 check(not any(s.get('ports') for s in sv.values()),'PUBLIC_PORT_FOUND')
 check(c['networks']['mcp-private'].get('internal') is True,'BACKEND_NOT_INTERNAL')
 check(c['volumes']['dsh_data']['name']=='deepharness_dsh_data' and c['volumes']['dsh_data'].get('external') is True,'DATA_VOLUME_MISMATCH')
 check(c['volumes']['dsh_workspace']['name']=='deepharness_dsh_workspace' and c['volumes']['dsh_workspace'].get('external') is True,'WORKSPACE_VOLUME_MISMATCH')
 check(db['networks'] and set(db['networks'])=={'mcp-private'},'DB_NETWORK_MISMATCH')
 check(set(w['networks'])=={'mcp-private','traefik-public'},'WEB_NETWORK_MISMATCH')
 check(w['depends_on']['mcp-grants-db']['condition']=='service_healthy','DB_STARTUP_GATE_MISMATCH')
 labels=w['labels']
 check(labels['traefik.http.routers.deepharness.middlewares']=='deepharness-auth','BASICAUTH_ROUTE_MISMATCH')
 check(labels['traefik.http.services.deepharness.loadbalancer.server.port']=='3080','WEB_PORT_MISMATCH')
 check(labels['traefik.http.middlewares.deepharness-auth.basicauth.users']==env['DSH_BASIC_AUTH_USERS'],'BASICAUTH_PLACEHOLDER_MISMATCH')
 mounts=w['volumes']
 sources={item.get('target'):item for item in mounts}
 for target in ['/etc/wandora-mcp/runtime.json','/run/secrets/backend-server-key.pem','/run/secrets/backend-server-chain.pem','/run/secrets/backend-ca.pem']:
  check(target in sources and sources[target].get('read_only') is True,'REQUIRED_READONLY_BIND_MISSING')
 check(sources['/etc/wandora-mcp/runtime.json']['source']==env['DSH_MCP_REVIEW_ROOT']+'/runtime.json','RUNTIME_BIND_MISMATCH')
 check({'mcp-admin-db-password','mcp-runtime-db-password'}<=set(c['secrets']),'SECRET_NAME_MISMATCH')
 print('STAGE_C_EFFECTIVE_COMPOSE_DUMMY_ONLY_MATCH')
 print('STAGE_C_UID1000_PRIVATE_NO_PROXY_MATCH')
 print('STAGE_C_EXISTING_VOLUMES_BASICAUTH_MATCH')
 print('NO_SECRETS_READ_NO_CONTAINER_START_NO_PORTAINER_WRITE')
except Exception as exc:
 # Fixed-code error only; never show original exception (may contain interpolated content).
 code=exc.args[0] if exc.args and isinstance(exc.args[0],str) and exc.args[0].isupper() and len(exc.args[0])<70 else 'VALIDATION_FAILED'
 print('STAGE_C_EFFECTIVE_COMPOSE_RED '+code,file=sys.stderr)
 sys.exit(1)
