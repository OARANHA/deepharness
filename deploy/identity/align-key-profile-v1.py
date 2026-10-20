#!/usr/bin/env python3
"""Dedicated unused MCP realm: disable only the generated RSA encryption provider."""
import getpass
import json
import os
import pathlib
import socket
import urllib.error
import urllib.parse
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def main():
    if os.geteuid() != 0 or socket.gethostname() != 'wandora-vps-01':
        raise RuntimeError('Execute como root somente em wandora-vps-01')
    password = getpass.getpass('Senha de wandora-owner: ')
    otp = getpass.getpass('Codigo atual do autenticador: ')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    token = None
    def api(method, path, data=None, form=False):
        headers = {}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        body = None
        if data is not None:
            body = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
        req = urllib.request.Request('http://127.0.0.1:18080' + path, data=body, headers=headers, method=method)
        try:
            with opener.open(req, timeout=20) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as exc:
            raise RuntimeError('Keycloak recusou a etapa: HTTP ' + str(exc.code)) from None
        except urllib.error.URLError:
            raise RuntimeError('Keycloak local indisponivel') from None
    auth = api('POST', '/realms/master/protocol/openid-connect/token', {
        'client_id': 'admin-cli', 'grant_type': 'password', 'username': 'wandora-owner',
        'password': password, 'totp': otp}, form=True)
    token = auth['access_token']
    del password, otp, auth
    base = '/admin/realms/deepharness'
    if api('GET', base).get('realm') != 'deepharness':
        raise RuntimeError('Realm inesperado')
    builtins = {'account', 'account-console', 'admin-cli', 'broker', 'realm-management', 'security-admin-console'}
    if any(client.get('clientId') not in builtins for client in api('GET', base + '/clients')):
        raise RuntimeError('Realm ja possui cliente dedicado; revisar uso de criptografia antes de alterar')
    if api('GET', base + '/users?max=1'):
        raise RuntimeError('Realm ja possui usuario; revisar antes de alterar')
    certs = '/realms/deepharness/protocol/openid-connect/certs'
    before = api('GET', certs)['keys']
    signing = lambda key: key.get('kty') == 'RSA' and key.get('alg') == 'RS256' and key.get('use') == 'sig'
    encryption = lambda key: key.get('kty') == 'RSA' and key.get('alg') == 'RSA-OAEP' and key.get('use') == 'enc'
    if not before or not any(signing(key) for key in before) or any(not signing(key) and not encryption(key) for key in before):
        raise RuntimeError('Perfil de chaves inesperado; nenhuma alteracao')
    if all(signing(key) for key in before):
        print('IDENTITY_MCP_RS256_KEY_PROFILE_MATCH: ja compativel; nenhuma alteracao')
        return
    providers = api('GET', base + '/components?type=org.keycloak.keys.KeyProvider')
    selected = [item for item in providers if item.get('providerId') == 'rsa-enc-generated']
    if len(selected) != 1:
        raise RuntimeError('Provedor de criptografia inesperado; nenhuma alteracao')
    provider = selected[0]
    path = base + '/components/' + urllib.parse.quote(provider['id'], safe='')
    provider = api('GET', path)
    old = json.loads(json.dumps(provider))
    identity = pathlib.Path('/opt/wandora/data/identity')
    if identity.is_symlink() or not identity.is_dir():
        raise RuntimeError('Diretorio de identidade inesperado')
    ops = identity / 'ops'
    if ops.is_symlink():
        raise RuntimeError('Diretorio operacional inesperado')
    ops.mkdir(mode=0o700, exist_ok=True)
    backup = ops / 'deepharness-key-profile-before-v1.json'
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump({'realm': 'deepharness', 'componentId': provider['id'],
                   'previousEnabled': provider.get('config', {}).get('enabled')}, handle)
        handle.flush()
        os.fsync(handle.fileno())
    provider.setdefault('config', {})['enabled'] = ['false']
    api('PUT', path, provider)
    after = api('GET', certs)['keys']
    if not after or not all(signing(key) for key in after) or {key['kid'] for key in before if signing(key)} != {key['kid'] for key in after}:
        api('PUT', path, old)
        raise RuntimeError('Readback inesperado; configuracao do provedor restaurada')
    print('IDENTITY_MCP_RS256_KEY_PROFILE_MATCH')
    print('Somente rsa-enc-generated desativado no realm deepharness; chaves de assinatura preservadas.')
    print('Realm master, contas, OAuth clients e validadores JWT inalterados.')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        print('INTERROMPIDO:', str(exc))
        raise SystemExit(1)
