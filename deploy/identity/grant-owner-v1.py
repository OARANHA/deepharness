#!/usr/bin/env python3
"""Grant master admin only after server-side OTP and required-action checks."""
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
    if len(users) != 1 or users[0].get("username") != OWNER or not users[0].get("enabled"):
        raise RuntimeError("Conta permanente ausente ou inesperada")
    user = users[0]
    if user.get("requiredActions"):
        raise RuntimeError("Acoes obrigatorias pendentes; concluir login antes de conceder admin")
    uid = urllib.parse.quote(user["id"], safe="")
    credentials = request("GET", "/admin/realms/master/users/" + uid + "/credentials")
    if not any(item.get("type") == "otp" for item in credentials):
        raise RuntimeError("MFA OTP ainda nao cadastrado; nenhum privilegio concedido")
    role = request("GET", "/admin/realms/master/roles/admin")
    if role.get("name") != "admin" or not role.get("id"):
        raise RuntimeError("Role administrativa inesperada")
    mapping = "/admin/realms/master/users/" + uid + "/role-mappings/realm"
    assigned = request("GET", mapping)
    if not any(item.get("id") == role["id"] for item in assigned):
        request("POST", mapping, [{"id": role["id"], "name": "admin"}])
    assigned = request("GET", mapping)
    if not any(item.get("id") == role["id"] for item in assigned):
        raise RuntimeError("Concessao nao confirmada no readback")
    print("IDENTITY_OWNER_MFA_VERIFIED_ADMIN_GRANTED")
    print("Conta wandora-owner: OTP cadastrado e role admin confirmada.")
    print("Bootstrap preservado ate validar acesso administrativo permanente.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyError, ValueError) as exc:
        print("INTERROMPIDO:", str(exc))
        raise SystemExit(1)

