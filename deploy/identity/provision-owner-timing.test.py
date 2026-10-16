import importlib.util, io, json, os, tempfile, contextlib
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('owner', Path(__file__).with_name('provision-owner-v2.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Response:
    def __init__(self, value): self.value = value
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return b'' if self.value is None else json.dumps(self.value).encode()
class API:
    def __init__(self): self.issued = False; self.expired = False; self.created = False
    def prompt(self, text):
        if self.issued: self.expired = True
        return 'private-password-fixture-123'
    def open(self, request, timeout):
        url = request.full_url
        if url.endswith('/token'):
            self.issued = True; self.expired = False
            return Response({'access_token': 'private-token-fixture'})
        if self.expired: raise m.urllib.error.HTTPError(url, 401, 'expired', {}, None)
        if '/users?' in url: return Response([{'requiredActions': ['CONFIGURE_TOTP']}] if self.created else [])
        if request.method == 'GET' and url.endswith('/deepharness'):
            if not self.created: raise m.urllib.error.HTTPError(url, 404, 'missing', {}, None)
            return Response({'realm': 'deepharness', 'enabled': True})
        if request.method == 'POST' and url.endswith('/users'): self.created = True
        return Response(None)
api = API()
with tempfile.TemporaryFile(mode='w+') as handle:
    handle.write('private-bootstrap-fixture'); handle.flush(); handle.seek(0)
    os.fchmod(handle.fileno(), 0o400)
    with patch.object(m.os, 'geteuid', return_value=0), patch.object(m.socket, 'gethostname', return_value='wandora-vps-01'), patch.object(m.os, 'open', side_effect=lambda *a, **k: os.dup(handle.fileno())), patch.object(m.urllib.request, 'build_opener', return_value=api), patch.object(m.getpass, 'getpass', side_effect=api.prompt), contextlib.redirect_stdout(io.StringIO()) as output:
        m.main()
    assert api.created
    assert 'IDENTITY_OWNER_PENDING_MFA_REALM_CREATED' in output.getvalue()
    assert 'private-' not in output.getvalue()
print('PASS: simulated human delay cannot expire the administrative token; no secret stdout')
