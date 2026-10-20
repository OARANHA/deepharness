#!/usr/bin/env python3
"""Retire bootstrap only after a fresh permanent owner MFA login."""
import getpass
import json
import os
import socket
import pathlib
import stat
import urllib.request
import urllib.parse
import urllib.error

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def main():
    if os.geteuid() != 0 or socket.gethostname() != "wandora-vps-01":
        raise RuntimeError("Execute como root somente em wandora-vps-01")
    password = getpass.getpass("Senha de wandora-owner: ")
    otp = getpass.getpass("Codigo atual do autenticador: ")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    base = "http://127.0.0.1:18080"
    body = urllib.parse.urlencode({
        "client_id": "admin-cli", "grant_type": "password",
        "username": "wandora-owner", "password": password, "totp": otp
    }).encode()
    req = urllib.request.Request(base + "/realms/master/protocol/openid-connect/token",
        data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with opener.open(req, timeout=20) as response:
            auth = json.load(response)
        del password, otp, body, req
        token = auth["access_token"]
        del auth
        req = urllib.request.Request(base + "/admin/realms/master",
            headers={"Authorization": "Bearer " + token})
        with opener.open(req, timeout=20) as response:
            realm = json.load(response)
        if realm.get("realm") != "master":
            raise RuntimeError("Resposta administrativa inesperada")
        def api(method, path):
            request = urllib.request.Request(base + path,
                headers={"Authorization": "Bearer " + token}, method=method)
            with opener.open(request, timeout=20) as response:
                data = response.read()
                return json.loads(data) if data else None
        users = api("GET", "/admin/realms/master/users?username=initial-owner&exact=true")
        if len(users) > 1 or any(user.get("username") != "initial-owner" for user in users):
            raise RuntimeError("Conta bootstrap inesperada; nenhuma exclusao")
        if users:
            uid = urllib.parse.quote(users[0]["id"], safe="")
            api("DELETE", "/admin/realms/master/users/" + uid)
        if api("GET", "/admin/realms/master/users?username=initial-owner&exact=true"):
            raise RuntimeError("Retirada da conta bootstrap nao confirmada")
        path = pathlib.Path("/opt/wandora/data/identity/secrets/bootstrap-password")
        fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW)
        try:
            meta = os.fstat(fd)
            if not stat.S_ISREG(meta.st_mode) or stat.S_IMODE(meta.st_mode) != 0o400 or meta.st_uid != 1000:
                raise RuntimeError("Metadados do arquivo bootstrap inesperados; conta removida, arquivo preservado")
            os.ftruncate(fd, 0)
            os.fsync(fd)
            if os.fstat(fd).st_size != 0:
                raise RuntimeError("Esvaziamento nao confirmado")
        finally:
            os.close(fd)
        del token, req
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Validacao recusada: HTTP " + str(exc.code) + "; confira a etapa concluida antes de repetir") from None
    except urllib.error.URLError:
        raise RuntimeError("Keycloak local indisponivel; confira a etapa concluida antes de repetir") from None
    print("IDENTITY_BOOTSTRAP_RETIRED_PERMANENT_ADMIN_VERIFIED")
    print("Conta initial-owner removida; arquivo bootstrap vazio preservado; conta permanente validada.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        print("INTERROMPIDO:", str(exc))
        raise SystemExit(1)
