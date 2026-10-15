#!/usr/bin/env python3
"""Populate only the existing pnpm store with the exact missing public JEV archive."""
import json,os,pathlib,re,socket,subprocess,urllib.parse,uuid
IMAGE='ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f'
ROOT=pathlib.Path('/opt/wandora/data/deepharness-mcp')
COMMIT='c97dcd2df01aa05bdc5ffefb456e54434faa434e'
def missing_archive(text):
    found=set()
    for raw in re.findall(r'https?://[^\s<>"\']+',text):
        raw=raw.rstrip('.,;)');u=urllib.parse.urlsplit(raw)
        parts=u.path.strip('/').split('/')
        if (u.scheme=='https' and u.netloc=='codeload.github.com' and not u.query and not u.fragment
            and len(parts)==4 and parts[0]=='luobosibing2'
            and parts[1] in ('dsh-jev-plugin','deepseek-harness-jev')
            and parts[2] in ('tar.gz','legacy.tar.gz') and parts[3]==COMMIT):
            found.add(raw)
    if len(found)!=1:
        raise RuntimeError('Referencia JEV ausente ou ambigua; nenhum download')
    return found.pop()
MINI_LOCK_JS=r"""
const fs=require('fs'),yaml=require('/opt/wandora-mcp-verifier/node_modules/js-yaml');
const d=yaml.load(fs.readFileSync(0,'utf8'));
const entries=Object.entries(d.packages??{}).filter(([k])=>k.startsWith('@dsh-jev/plugin@')&&k.includes('c97dcd2df01aa05bdc5ffefb456e54434faa434e'));
if(entries.length!==1)throw Error('JEV lock entry ambiguous');
const [key,value]=entries[0],r=value.resolution;
if(r.gitHosted!==true||typeof r.integrity!=='string'||!/^sha512-[A-Za-z0-9+/]+=*$/.test(r.integrity))throw Error('Unverified JEV lock entry');
const url=new URL(r.tarball);
if(url.protocol!=='https:'||url.hostname!=='codeload.github.com'||url.username||url.password||url.search||url.hash)throw Error('Unexpected JEV source');
const version=key.slice('@dsh-jev/plugin@'.length);
console.log(JSON.stringify({lockfileVersion:'9.0',settings:{autoInstallPeers:false,excludeLinksFromLockfile:false},importers:{'.':{dependencies:{'@dsh-jev/plugin':{specifier:r.tarball,version}}}},packages:{[key]:{resolution:r,version:value.version??'0.1.0'}},snapshots:{[key]:{}}}));
"""
FETCH_JS=r"""
const fs=require('fs'),cp=require('child_process');
fs.mkdirSync('/tmp/work',{recursive:true});
fs.writeFileSync('/tmp/work/pnpm-lock.yaml',fs.readFileSync(0));
const flags=['fetch','--config.ignore-scripts=true','--store-dir','/cache','--config.auto-install-peers=false','--registry','https://registry.npmjs.org','--config.offline='+process.env.MCP_CACHE_OFFLINE];
const r=cp.spawnSync('/usr/local/bin/pnpm',flags,{cwd:'/tmp/work',stdio:'inherit',env:process.env});
process.exit(r.status??1);
"""
def args_for(name,offline):
    return ['docker','run','--rm','-i','--name',name,'--label','wandora.operation=mcp-cache-prefetch-v1',
            '--pull','never','--network','none' if offline else 'bridge','--read-only','--user','1000:1000',
            '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m',
            '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777',
            '--mount','type=volume,src=deepharness_dsh_data,dst=/cache,volume-subpath=.local/share/pnpm/store',
            '-e','HOME=/tmp','-e','XDG_CACHE_HOME=/tmp/cache','-e','NPM_CONFIG_CACHE=/tmp/npm',
            '-e','MCP_CACHE_OFFLINE='+str(offline).lower(),
            '--workdir','/tmp','--entrypoint','node',IMAGE,'-e',FETCH_JS]
def stop_own(name):
    r=subprocess.run(['docker','container','inspect','--format','{{.Config.Image}} {{index .Config.Labels "wandora.operation"}}',name],capture_output=True,timeout=15)
    if r.returncode:
        if b'No such' in r.stderr or b'no such' in r.stderr:return
        raise RuntimeError('Encerramento do prefetch nao confirmado')
    if r.stdout.decode().strip()!=IMAGE+' mcp-cache-prefetch-v1':
        raise RuntimeError('Container inesperado; nenhum container alheio removido')
    subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
def main():
    if os.geteuid()!=0 or socket.gethostname()!='28server':
        raise RuntimeError('Execute como root somente no 28server')
    for p in [*reversed(ROOT.parents),ROOT]:
        if p.is_symlink() or not p.is_dir():raise RuntimeError('Raiz privada inesperada')
    if ROOT.stat().st_uid!=0 or ROOT.stat().st_mode&0o077:raise RuntimeError('Raiz privada inesperada')
    log=ROOT/'ops-resume-path-v1/mcp-installer-private.log'
    if log.is_symlink():raise RuntimeError('Log inesperado')
    url=missing_archive(log.read_text(errors='replace'))
    original=subprocess.run(['docker','exec','--user','node','deepharness-web-1','node','-e',"process.stdout.write(require('fs').readFileSync('/data/dsh/profiles/web/pnpm-lock.yaml'))"],check=True,capture_output=True,timeout=30).stdout
    parsed=subprocess.run(['docker','run','--rm','-i','--pull','never','--network','none','--read-only',
                           '--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',IMAGE,'-e',MINI_LOCK_JS],
                          input=original,capture_output=True,check=True,timeout=30).stdout
    mini=json.loads(parsed)
    resolution=next(iter(mini['packages'].values()))['resolution']
    if resolution['tarball']!=url:
        raise RuntimeError('Fonte do lock difere da falha; nenhum download')
    os.umask(0o077)
    audit=ROOT/'cache-prefetch-v1'
    audit.mkdir(mode=0o700,exist_ok=False)
    for offline in (False,True):
        name='mcp-cache-prefetch-'+uuid.uuid4().hex[:12]
        print('Validando reutilizacao sem rede.' if offline else 'Precarregando somente o arquivo JEV fixado; perfil e workspace nao montados.',flush=True)
        try:
            r=subprocess.run(args_for(name,offline),input=parsed,capture_output=True,timeout=300)
        finally:
            stop_own(name)
        (audit/('offline.log' if offline else 'download.log')).write_bytes(r.stdout+b'\n'+r.stderr)
        if r.returncode:
            codes=sorted(set(re.findall(rb'\b(?:ERR_[A-Z0-9_]+|EACCES|EROFS|ENOENT|ENOSPC)\b',r.stdout+r.stderr)))
            print('ERROR_CODES:',[x.decode() for x in codes])
            raise RuntimeError('Cache nao validado; nenhum instalador ou redeploy executado')
    print('MCP_PINNED_JEV_CACHE_OFFLINE_MATCH')
    print('Somente cache pnpm preenchido; perfil, bundles, workspace e servicos nao alterados.')
if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,subprocess.SubprocessError) as e:
        print('INTERROMPIDO:',str(e) if isinstance(e,RuntimeError) else 'Operacao interrompida; revisar log privado; nenhum deploy')
        raise SystemExit(1)
