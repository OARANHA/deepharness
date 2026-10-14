"""CI-only: validate public discovery response; never parse credentials."""
import json
import sys
from pathlib import Path

def verify(raw):
    head, body = raw.split(b"\r\n\r\n", 1)
    status = head.split(b"\r\n", 1)[0].split()
    if len(status) < 2 or status[1] != b"200":
        raise ValueError("Discovery HTTP status is not 200")
    doc = json.loads(body)
    issuer = "https://id.wandora.com.br/realms/master"
    if doc.get("issuer") != issuer:
        raise ValueError("Unexpected discovery issuer")
    if not doc.get("authorization_endpoint", "").startswith(issuer + "/"):
        raise ValueError("Unexpected authorization endpoint")
    return doc

if __name__ == "__main__":
    doc = verify(Path(sys.argv[1]).read_bytes())
    Path(sys.argv[2]).write_text(json.dumps(doc), encoding="utf-8")
