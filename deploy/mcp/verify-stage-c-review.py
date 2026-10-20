import json,os,subprocess,yaml,pathlib
base=pathlib.Path('/opt/wandora/ops-workspace')
stage=base/'dsh-mcp-stage-c-review.yml'
before=base/'dsh-original-stack-reference-20261015.yml'
env=dict(os.environ,DEEPHARNESS_IMAGE='example.invalid/web:test',DSH_BASIC_AUTH_USERS='dummy',DSH_MCP_HOST_IMAGE='example.invalid/host:test',DSH_MCP_PROXY_IMAGE='example.invalid/proxy:test',DSH_MCP_GRANTS_IMAGE='example.invalid/grants:test',DSH_MCP_REVIEW_ROOT='/tmp',DSH_MCP_SECRET_ROOT='/tmp')
def resolve(p):
 r=subprocess.run(['docker','compose','-f',str(p),'config','--format','json'],capture_output=True,text=True,env=env,timeout=30,check=True)
 return json.loads(r.stdout)
c=resolve(stage); o=resolve(before)
assert set(c['services'])=={'web','mcp-grants-db'},set(c['services'])
assert set(o['services'])=={'web'}
assert 'mcp-proxy' not in c['services']
assert c['services']['web']['image']=='example.invalid/host:test'
assert o['services']['web']['image']=='example.invalid/web:test'
assert not any(x.get('published') for s in c['services'].values() for x in s.get('ports',[]))
assert c['volumes']['dsh_data']['name']=='deepharness_dsh_data'
assert c['volumes']['dsh_workspace']['name']=='deepharness_dsh_workspace'
assert c['services']['web']['depends_on']['mcp-grants-db']['condition']=='service_healthy'
assert c['networks']['mcp-private']['internal']==True
assert o['services']['web']['command'][0:2]==['sh','-ec']
print('STAGE_C_NATIVE_RESOLVED_CONFIG_MATCH')
print('STAGE_C_NO_PUBLIC_MCP_PROXY_MATCH')
print('STAGE_C_SOURCE_ONLY_ROLLBACK_RESTORES_ORIGINAL_WEB_MATCH')
print('NO_CONTAINER_START_OR_PRODUCTION_RESTORE_PERFORMED')
