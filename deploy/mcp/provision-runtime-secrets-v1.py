#!/usr/bin/env python3
"""One-time preparation on 28server. No deploy, public listener or credential output."""
import os
import pathlib
import secrets
import shutil
import socket
import subprocess

ROOT = pathlib.Path('/opt/wandora/data/deepharness-mcp')

def provision():
    if os.geteuid() != 0 or socket.gethostname() != '28server':
        raise RuntimeError('Execute como root somente no 28server')
    if not shutil.which('openssl'):
        raise RuntimeError('OpenSSL ausente; nenhuma alteracao')
    for parent in reversed(ROOT.parent.parents):
        if parent.is_symlink() or not parent.is_dir():
            raise RuntimeError('Ancestral ausente ou inesperado; nenhuma alteracao')
    if ROOT.exists() or ROOT.is_symlink():
        raise RuntimeError('Diretorio MCP ja existe; preservar e revisar antes de continuar')
    if ROOT.parent.is_symlink() or (ROOT.parent.exists() and not ROOT.parent.is_dir()):
        raise RuntimeError('Ancestral ausente ou inesperado; nenhuma alteracao')
    os.umask(0o077)
    ROOT.parent.mkdir(mode=0o700, exist_ok=True)
    ROOT.mkdir(mode=0o700)
    database = ROOT / 'secrets'
    authority = ROOT / 'tls' / 'authority'
    backend = ROOT / 'tls' / 'backend'
    proxy = ROOT / 'tls' / 'proxy'
    for directory in [database, authority, backend, proxy]:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    def private_file(path, value, uid, gid, mode):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        with os.fdopen(fd, 'w') as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchown(handle.fileno(), uid, gid)
            os.fchmod(handle.fileno(), mode)
    private_file(database / 'admin-db-password', secrets.token_hex(32) + '\n', 999, 999, 0o400)
    private_file(database / 'runtime-db-password', secrets.token_hex(32) + '\n', 1000, 999, 0o440)
    def ssl(*args):
        try:
            subprocess.run(['openssl', *map(str, args)], check=True, stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
        except (subprocess.SubprocessError, OSError):
            raise RuntimeError('Preparacao TLS interrompida; arquivos parciais preservados, nenhum deploy') from None
    ca_key, ca_cert = authority / 'backend-ca.key', authority / 'backend-ca.pem'
    ssl('req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '1825',
        '-keyout', ca_key, '-out', ca_cert, '-subj', '/CN=Wandora DeepHarness MCP Backend CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
    for name, directory, dns, purpose in [
        ('backend-server', backend, 'deepharness-mcp-backend', 'serverAuth'),
        ('proxy-backend-client', proxy, 'deepharness-mcp-proxy', 'clientAuth')]:
        key, cert = directory / (name + '-key.pem'), directory / (name + '-chain.pem')
        csr, extension = authority / (name + '.csr'), authority / (name + '.ext')
        private_file(extension, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n'
                     + 'extendedKeyUsage=' + purpose + '\nsubjectAltName=DNS:' + dns + '\n', 0, 0, 0o600)
        ssl('req', '-new', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-keyout', key,
            '-out', csr, '-subj', '/CN=' + dns)
        ssl('x509', '-req', '-sha256', '-days', '365', '-in', csr, '-CA', ca_cert,
            '-CAkey', ca_key, '-set_serial', '0x' + secrets.token_hex(16), '-out', cert, '-extfile', extension)
        ssl('verify', '-CAfile', ca_cert, '-purpose', 'sslserver' if purpose == 'serverAuth' else 'sslclient', cert)
        ssl('x509', '-in', cert, '-noout', '-checkhost', dns)
        private_file(directory / 'backend-ca.pem', ca_cert.read_text(), 1000, 1000, 0o444)
        os.chown(key, 1000, 1000)
        os.chmod(key, 0o400)
        os.chown(cert, 1000, 1000)
        os.chmod(cert, 0o444)
        os.chown(directory, 1000, 1000)
        os.chmod(directory, 0o500)
    os.chmod(ca_key, 0o600)
    os.chmod(ca_cert, 0o644)
    print('MCP_PRIVATE_RUNTIME_SECRETS_PROVISIONED')
    print('28server: senhas privadas e TLS interno preparados; valores nao emitidos; nenhum deploy.')
    print('Certificado HTTPS publico e cadeia OpenAI ainda pendentes; nenhum volume Docker criado.')

if __name__ == '__main__':
    try:
        provision()
    except (RuntimeError, OSError) as exc:
        print('INTERROMPIDO:', str(exc))
        raise SystemExit(1)
