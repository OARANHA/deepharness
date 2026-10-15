#!/usr/bin/env python3
"""Owner terminal only. Dedicated ACME state; no deployment or shared Traefik state."""
import getpass
import os
import pathlib
import re
import shutil
import socket
import subprocess
import urllib.request

ROOT = pathlib.Path('/opt/wandora/data/deepharness-mcp')
DOMAIN = 'dsh-mcp.wandora.com.br'
IMAGE = 'certbot/dns-cloudflare@sha256:c45edb002b883da1a1235abb205dff474a7a1a459d878e8d5fdc7f9d83073aea'

def command(args, capture=False, timeout=90):
    try:
        return subprocess.run(args, check=True, stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        raise RuntimeError('Etapa operacional recusada; nenhum deploy; detalhes privados permanecem no servidor') from None

def validate_token(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,256}', value):
        raise RuntimeError('Formato do token Cloudflare invalido')
    return value

def validate_pair(cert, key, chain, *, hostname=DOMAIN, trust_file=None):
    command(['openssl','x509','-in',str(cert),'-noout','-checkhost',hostname])
    command(['openssl','x509','-in',str(cert),'-noout','-checkend','604800'])
    public = command(['openssl','x509','-in',str(cert),'-noout','-pubkey'], capture=True)
    key_public = command(['openssl','pkey','-in',str(key),'-pubout'], capture=True)
    if public != key_public:
        raise RuntimeError('Certificado e chave nao correspondem')
    trust = ['-CAfile',str(trust_file)] if trust_file else ['-CApath','/etc/ssl/certs']
    command(['openssl','verify','-purpose','sslserver','-verify_hostname',hostname,*trust,
             '-untrusted',str(chain),str(cert)])

def private_directory(path):
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        raise RuntimeError('Diretorio privado inesperado')
    path.mkdir(mode=0o700, exist_ok=True)
    if path.stat().st_uid != 0 or path.stat().st_mode & 0o077:
        raise RuntimeError('Diretorio privado precisa pertencer a root com modo 0700')

def create_file(path, content, mode=0o600):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
        os.fchmod(handle.fileno(),mode)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

def download_ca(name):
    url='https://developers.openai.com/plugins/mtls/'+name
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    try:
        with opener.open(url,timeout=30) as response:
            data=response.read(65537)
    except Exception:
        raise RuntimeError('Cadeia publica OpenAI indisponivel; nenhum deploy') from None
    if len(data)>65536 or not data.startswith(b'-----BEGIN CERTIFICATE-----') or b'PRIVATE KEY' in data:
        raise RuntimeError('Cadeia publica OpenAI inesperada')
    return data

def main():
    if os.geteuid()!=0 or socket.gethostname()!='28server':
        raise RuntimeError('Execute como root somente no 28server')
    if not shutil.which('docker') or not shutil.which('openssl'):
        raise RuntimeError('Docker ou OpenSSL indisponivel')
    for parent in [*reversed(ROOT.parents),ROOT]:
        if parent.is_symlink() or not parent.is_dir():
            raise RuntimeError('Ancestral privado inesperado')
    if ROOT.stat().st_uid!=0 or ROOT.stat().st_mode & 0o077:
        raise RuntimeError('Raiz privada precisa pertencer a root com modo 0700')
    proxy=ROOT/'tls/proxy'
    if proxy.is_symlink() or not proxy.is_dir() or not (proxy/'backend-ca.pem').is_file():
        raise RuntimeError('Prepare primeiro o TLS interno')
    for name in ['public-server-chain.pem','public-server-key.pem','openai-connectors-intermediate.pem']:
        if (proxy/name).exists() or (proxy/name).is_symlink():
            raise RuntimeError('TLS publico ja existe; preservar e revisar renovacao')
    os.umask(0o077)
    acme=ROOT/'acme'
    private_directory(acme)
    for name in ['config','work','logs','review']:
        private_directory(acme/name)
    print('Preparando emissor ACME dedicado; nenhuma porta sera publicada.',flush=True)
    command(['docker','pull',IMAGE],timeout=600)
    version=command(['docker','run','--rm','--network','none',IMAGE,'--version'],capture=True)
    if not re.fullmatch(rb'certbot [0-9]+\.[0-9]+\.[0-9]+\s*',version):
        raise RuntimeError('Versao do emissor inesperada')
    plugins=command(['docker','run','--rm','--network','none',IMAGE,'plugins','--text'],capture=True)
    if b'dns-cloudflare' not in plugins:
        raise RuntimeError('Plugin DNS Cloudflare ausente')
    credential=acme/'cloudflare.ini'
    if credential.exists() or credential.is_symlink():
        if credential.is_symlink() or not credential.is_file() or credential.stat().st_uid!=0 or credential.stat().st_mode & 0o077:
            raise RuntimeError('Credencial privada com propriedade ou modo inesperado')
    else:
        token=validate_token(getpass.getpass('Token Cloudflare restrito a DNS Edit em wandora.com.br (oculto): ').strip())
        create_file(credential,('dns_cloudflare_api_token = '+token+'\n').encode())
        del token
    email=input('Email para avisos ACME: ').strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254:
        raise RuntimeError('Email ACME invalido')
    base=['docker','run','--rm','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
          '--pids-limit','128','--memory','256m','--cpus','0.5',
          '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
          '--mount','type=bind,src='+str(credential)+',dst=/run/secrets/cloudflare.ini,readonly',
          '--mount','type=bind,src='+str(acme/'config')+',dst=/etc/letsencrypt',
          '--mount','type=bind,src='+str(acme/'work')+',dst=/var/lib/letsencrypt',
          '--mount','type=bind,src='+str(acme/'logs')+',dst=/var/log/letsencrypt',IMAGE]
    print('Emitindo certificado por DNS-01. Aguarde a propagacao DNS.',flush=True)
    command([*base,'certonly','--non-interactive','--agree-tos','--email',email,'--dns-cloudflare',
             '--dns-cloudflare-credentials','/run/secrets/cloudflare.ini','--dns-cloudflare-propagation-seconds','60',
             '--cert-name',DOMAIN,'-d',DOMAIN,'--key-type','ecdsa'],timeout=600)
    print('Testando renovacao ACME em staging.',flush=True)
    command([*base,'renew','--non-interactive','--dry-run','--cert-name',DOMAIN],timeout=600)
    live=acme/'config/live'/DOMAIN
    for name in ['cert.pem','chain.pem','fullchain.pem','privkey.pem']:
        if not (live/name).resolve().is_relative_to((acme/'config').resolve()):
            raise RuntimeError('Caminho ACME inesperado')
    validate_pair(live/'cert.pem',live/'privkey.pem',live/'chain.pem')
    review=acme/'review'
    # These are public CA files from the links in the official OpenAI documentation.
    root_ca,intermediate=review/'openai-root-ca.pem',review/'openai-connectors-intermediate.pem'
    for path,name in [(root_ca,'openai-root-ca.pem'),(intermediate,'openai-connectors-mtls-ca.pem')]:
        if path.exists() or path.is_symlink():
            raise RuntimeError('Material publico de revisao ja existe; preservar e revisar')
        create_file(path,download_ca(name))
        command(['openssl','x509','-in',str(path),'-noout','-checkend','604800'])
        text=command(['openssl','x509','-in',str(path),'-noout','-text'],capture=True)
        if b'CA:TRUE' not in text:
            raise RuntimeError('Cadeia OpenAI nao e autoridade certificadora')
    command(['openssl','verify','-CAfile',str(root_ca),str(intermediate)])
    for destination,source,mode in [('public-server-chain.pem',live/'fullchain.pem',0o444),
                                    ('public-server-key.pem',live/'privkey.pem',0o400),
                                    ('openai-connectors-intermediate.pem',intermediate,0o444)]:
        path=proxy/destination
        create_file(path,source.read_bytes(),mode)
        os.chown(path,1000,1000)
    print('MCP_PUBLIC_TLS_DNS01_RENEWAL_DRYRUN_MATCH')
    print('28server: certificado publico, chave e CA OpenAI preparados; valores privados nao emitidos.')
    print('Renovacao dry-run validada. Agendamento e recarga do proxy ainda pendentes da ativacao; nenhum deploy.')

if __name__=='__main__':
    try:
        main()
    except (RuntimeError,OSError) as exc:
        print('INTERROMPIDO:',str(exc))
        raise SystemExit(1)
