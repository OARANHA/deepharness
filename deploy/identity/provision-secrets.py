"""Provision identity secret files only; requires approved root execution."""
import hashlib
import os
from pathlib import Path
import secrets
import socket
import stat

if os.geteuid() != 0 or socket.gethostname() != "wandora-vps-01":
    raise SystemExit("Wrong host or execution identity")
parent = Path("/opt/wandora/data")
info = parent.lstat()
if not stat.S_ISDIR(info.st_mode) or parent.is_symlink():
    raise SystemExit("Invalid data parent")
target = parent / "identity"
if target.exists() or target.is_symlink():
    raise SystemExit("Identity destination already exists; inspect before provisioning")
target.mkdir(mode=0o700)
directory = target / "secrets"
directory.mkdir(mode=0o700)
for name in ("db-password", "bootstrap-password"):
    value = (secrets.token_hex(32) + "\n").encode()
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        os.write(fd, value)
        os.fchown(fd, 1000, 0)
        os.fchmod(fd, 0o400)
        os.fsync(fd)
    finally:
        os.close(fd)
print("IDENTITY_SECRET_FILES_PROVISIONED: two private files; values not emitted; no deploy")
