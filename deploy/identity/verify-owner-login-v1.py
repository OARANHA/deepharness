#!/usr/bin/env python3
"""Verify permanent owner login and admin access without persisting credentials."""
import getpass
import json
import os
import socket
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
        del token, req
        if realm.get("realm") != "master":
            raise RuntimeError("Resposta administrativa inesperada")
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Validacao recusada: HTTP " + str(exc.code) + "; bootstrap preservado") from None
    except urllib.error.URLError:
        raise RuntimeError("Keycloak local indisponivel; bootstrap preservado") from None
    print("IDENTITY_PERMANENT_ADMIN_LOGIN_MFA_VERIFIED")
    print("Senha e OTP aceitos; leitura administrativa confirmada; nenhuma alteracao realizada.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        print("INTERROMPIDO:", str(exc))
        raise SystemExit(1)
