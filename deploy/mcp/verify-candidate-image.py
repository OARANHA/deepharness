"""Verify pinned manifest/config identity with classic or containerd Docker IDs."""
import json,sys
MANIFEST='sha256:89879cc358ad557dfc151f401a3f796afda7e3bc19d865c99949d9f00d302fc6'
CONFIG='sha256:cec5b1aaa1948170c2bc731815dda1db20b18f1b66096717a5ccb4e54ad3de51'
REFERENCE='ghcr.io/oaranha/deepharness-mcp@'+MANIFEST
SOURCE='f5a5a4f75b680fa1866d843014ea61e7a5e40506'
def verify(local,registry):
    def require(condition):
        if not condition:raise ValueError('Candidate identity denied')
    require(registry.get('schemaVersion')==2)
    require(registry.get('mediaType')=='application/vnd.docker.distribution.manifest.v2+json')
    require(registry.get('config',{}).get('digest')==CONFIG)
    require(local.get('Id') in (CONFIG,MANIFEST))
    require(REFERENCE in local.get('RepoDigests',[]))
    descriptor=local.get('Descriptor')
    if descriptor is not None:require(descriptor.get('digest')==MANIFEST)
    else:require(local.get('Id')==CONFIG)
    require(local.get('Os')=='linux' and local.get('Architecture')=='amd64')
    config=local.get('Config')
    require(isinstance(config,dict))
    require(config.get('Labels',{}).get('org.opencontainers.image.revision')==SOURCE)
if __name__=='__main__':
    try:
        local=json.load(open(sys.argv[1]));registry=json.load(open(sys.argv[2]))
        if not isinstance(local,list) or len(local)!=1:raise ValueError()
        verify(local[0],registry)
        print('CANDIDATE_MANIFEST_CONFIG_PLATFORM_MATCH')
    except Exception:
        raise SystemExit('CANDIDATE_IMAGE_IDENTITY_DENIED')
