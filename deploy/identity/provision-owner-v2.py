#!/usr/bin/env python3
"""Prepare one human owner with mandatory TOTP; never grant admin before MFA."""
import getpass
import json
import os
import pathlib
import socket
import stat
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:18080"
OWNER = "wandora-owner"
REALM = "deepharness"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def main():
    if os.geteuid() != 0 or socket.gethostname() != "wandora-vps-01":
        raise RuntimeError("Execute como root somente em wandora-vps-01")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    token = None

    def request(method, path, data=None, form=False, missing_ok=False):
        headers = {}
        payload = None
        if token:
            headers["Authorization"] = "Bearer " + token
        if data is not None:
            payload = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
            headers["Content-Type"] = ("application/x-www-form-urlencoded" if form else "application/json")
        req = urllib.request.Request(BASE + path, data=payload, headers=headers, method=method)
        try:
            with opener.open(req, timeout=20) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            if missing_ok and exc.code == 404:
                return None
            raise RuntimeError("Keycloak recusou " + method + " " + path + ": HTTP " + str(exc.code)) from None
        except urllib.error.URLError:
            raise RuntimeError("Keycloak local indisponivel; nenhuma credencial foi exibida") from None

    password = getpass.getpass("Nova senha para wandora-owner (minimo 16 caracteres): ")
    repeat = getpass.getpass("Repita a nova senha: ")
    if len(password) < 16 or password != repeat:
        raise RuntimeError("Senha curta ou confirmacao diferente; nenhuma conta criada")
    del repeat

    secret_path = pathlib.Path("/opt/wandora/data/identity/secrets/bootstrap-password")
    fd = os.open(secret_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        meta = os.fstat(handle.fileno())
        if not stat.S_ISREG(meta.st_mode) or stat.S_IMODE(meta.st_mode) != 0o400:
            raise RuntimeError("Metadados inesperados no arquivo bootstrap")
        bootstrap = handle.read().strip()
    if not bootstrap:
        raise RuntimeError("Bootstrap ausente; nao recriar nem redefinir credenciais")
    auth = request("POST", "/realms/master/protocol/openid-connect/token", {
        "client_id": "admin-cli", "grant_type": "password",
        "username": "initial-owner", "password": bootstrap
    }, form=True)
    token = auth["access_token"]
    del auth, bootstrap
    users = request("GET", "/admin/realms/master/users?username=" + OWNER + "&exact=true")
    if users:
        raise RuntimeError("Conta wandora-owner ja existe; interrompido sem redefinir senha")
    realm = request("GET", "/admin/realms/" + REALM, missing_ok=True)
    if realm is not None:
        raise RuntimeError("Realm deepharness ja existe; revisar antes de continuar")
    request("POST", "/admin/realms", {
        "realm": REALM, "displayName": "DeepHarness", "enabled": True,
        "sslRequired": "all", "registrationAllowed": False,
        "resetPasswordAllowed": False, "rememberMe": False,
        "bruteForceProtected": True, "permanentLockout": False,
        "accessTokenLifespan": 300, "ssoSessionIdleTimeout": 1800,
        "ssoSessionMaxLifespan": 36000
    })
    request("POST", "/admin/realms/master/users", {
        "username": OWNER, "firstName": "Wandora", "lastName": "Owner",
        "enabled": True, "requiredActions": ["CONFIGURE_TOTP"],
        "credentials": [{"type": "password", "value": password, "temporary": False}]
    })
    del password
    created = request("GET", "/admin/realms/master/users?username=" + OWNER + "&exact=true")
    if len(created) != 1 or "CONFIGURE_TOTP" not in created[0].get("requiredActions", []):
        raise RuntimeError("Readback inesperado; preservar objetos e revisar")
    observed = request("GET", "/admin/realms/" + REALM)
    if observed.get("realm") != REALM or not observed.get("enabled"):
        raise RuntimeError("Readback do realm inesperado")
    print("IDENTITY_OWNER_PENDING_MFA_REALM_CREATED")
    print("Conta: wandora-owner; sem privilegio admin ate confirmar MFA.")
    print("Abra https://id.wandora.com.br/realms/master/account/ e configure o autenticador.")
    print("Bootstrap preservado; nenhum cliente OAuth criado.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyError, ValueError) as exc:
        print("INTERROMPIDO:", str(exc))
        raise SystemExit(1)

