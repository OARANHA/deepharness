#!/usr/bin/env python3
"""Owner-run backup and disabled-only package migration, never starts a second DSH."""
import hashlib
import os
import pathlib
import re
import shutil
import socket
import subprocess
import uuid

ROOT=pathlib.Path('/opt/wandora/data/deepharness-mcp')
IMAGE='ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f'
SOURCE=pathlib.Path('/opt/wandora/ops-workspace/install-existing-mcp-profile.mjs')
EXPECTED_SCRIPT_SHA='4f540be9ce666437b99fc49251e91fe43a785e65d06d6f49cc3f97b83f7b6868'

def close_installer(cidfile,name):
    reference=name
    if cidfile.exists():
        if cidfile.is_symlink():
            raise RuntimeError('CID inesperado; encerramento nao confirmado')
        reference=cidfile.read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{64}',reference):
            raise RuntimeError('CID inesperado; encerramento nao confirmado')
    result=subprocess.run(['docker','container','inspect','--format','{{.Config.Image}} {{index .Config.Labels "wandora.operation"}}',reference],
                          stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
    if result.returncode!=0:
        message=result.stderr.decode(errors='replace').lower()
        if 'no such object' in message or 'no such container' in message:
            return
        raise RuntimeError('Nao foi possivel confirmar encerramento do instalador; revisar antes de continuar')
    if result.stdout.decode().strip()!=IMAGE+' deepharness-mcp-disabled-install-v1':
        raise RuntimeError('Identidade do instalador diferente; nenhum container alheio foi removido')
    subprocess.run(['docker','rm','-f',reference],check=True,stdin=subprocess.DEVNULL,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)

def main():
    if os.geteuid()!=0 or socket.gethostname()!='28server':
        raise RuntimeError('Execute como root somente no 28server')
    for path in [*reversed(ROOT.parents),ROOT]:
        if path.is_symlink() or not path.is_dir():
            raise RuntimeError('Raiz privada inesperada')
    if ROOT.stat().st_uid!=0 or ROOT.stat().st_mode&0o077:
        raise RuntimeError('Raiz privada precisa de root0700')
    if SOURCE.is_symlink() or hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=EXPECTED_SCRIPT_SHA:
        raise RuntimeError('Script de instalacao diferente; nenhuma alteracao')
    os.umask(0o077)
    def run(args,**kwargs):
        return subprocess.run(args,check=True,stdin=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                              stdout=subprocess.PIPE,timeout=90,**kwargs).stdout
    if run(['docker','inspect','--format','{{.Config.Image}}','deepharness-web-1']).decode().strip()!='ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075':
        raise RuntimeError('Imagem atual diferente da revisada; nenhuma alteracao')
    mounts=run(['docker','inspect','--format','{{range .Mounts}}{{if eq .Destination "/data/dsh"}}{{.Name}}{{end}}{{end}}','deepharness-web-1']).decode().strip()
    if mounts!='deepharness_dsh_data':
        raise RuntimeError('Volume DSH inesperado; nenhuma alteracao')
    if run(['docker','image','inspect','--format','{{.Id}}',IMAGE]).decode().strip()!='sha256:3d0d025371a574c4e711e5c0e110ff003bf0f9a6c01e6d263d81fdad2f3e8476':
        raise RuntimeError('Imagem candidata diferente da testada; nenhuma alteracao')
    size=run(['docker','exec','--user','node','deepharness-web-1','du','-sk','/data/dsh/profiles/web']).decode().split()[0]
    if not size.isdecimal() or shutil.disk_usage(ROOT).free < int(size)*1024*2+256*1024*1024:
        raise RuntimeError('Espaco insuficiente para backup privado; nenhuma alteracao')
    backup=ROOT/'backups'
    if backup.exists() or backup.is_symlink():
        raise RuntimeError('Backup de migracao ja existe; preservar e revisar')
    backup.mkdir(mode=0o700)
    print('Preservando perfil Web completo em backup privado.',flush=True)
    # No credentials/session contents cross stdout/chat. Docker copies directly to this VPS.
    run(['docker','cp','deepharness-web-1:/data/dsh/profiles/web',str(backup/'web-before-mcp')])
    ops=ROOT/'ops'
    if ops.is_symlink() or (ops.exists() and not ops.is_dir()):
        raise RuntimeError('Diretorio operacional inesperado')
    ops.mkdir(mode=0o700,exist_ok=True)
    runner=ops/'install-existing-profile.mjs'
    with runner.open('xb') as handle:
        handle.write(SOURCE.read_bytes())
    os.chown(runner,1000,1000);os.chmod(runner,0o400)
    log=ops/'mcp-installer-private.log'
    with log.open('xb'):
        pass
    os.chown(log,1000,1000);os.chmod(log,0o600)
    print('Instalando somente o bundle MCP desativado pelo instalador oficial offline.',flush=True)
    name='dsh-mcp-disabled-install-'+uuid.uuid4().hex[:12]
    cidfile=ops/'installer-container.id'
    args=['docker','run','--name',name,'--cidfile',str(cidfile),
          '--label','wandora.operation=deepharness-mcp-disabled-install-v1',
          '--user','1000:1000','--read-only','--network','none',
          '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','2g',
          '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777',
          '--mount','type=volume,src=deepharness_dsh_data,dst=/data/dsh',
          '--mount','type=volume,src=deepharness_dsh_workspace,dst=/workspace',
          '--mount','type=bind,src='+str(runner)+',dst=/run/mcp-installer.mjs,readonly',
          '--mount','type=bind,src='+str(log)+',dst=/run/mcp-installer.log',
          '-e','DSH_MCP_OPERATOR_INSTALL=disabled-only-v1','-e','PATH=/usr/local/bin:/usr/bin:/bin',
          IMAGE,'node','/run/mcp-installer.mjs']
    try:
        result=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=600)
    finally:
        try:
            close_installer(cidfile,name)
        finally:
            os.chown(log,0,0)
    marker=b'MCP_EXISTING_WEB_PROFILE_DISABLED_INSTALL_MATCH'
    if result.returncode!=0 or marker not in result.stdout:
        raise RuntimeError('Instalacao nao validada; backup privado preservado; nenhum redeploy. Revisar antes de repetir')
    print(marker.decode())
    print('28server: bundles, dependencias e patches existentes preservados; conector desativado; nenhum listener/redeploy.')

if __name__=='__main__':
    try:
        main()
    except (RuntimeError,OSError,subprocess.SubprocessError) as exc:
        print('INTERROMPIDO:',str(exc) if isinstance(exc,RuntimeError) else 'Operacao interrompida; backup preservado; nenhum deploy')
        raise SystemExit(1)
