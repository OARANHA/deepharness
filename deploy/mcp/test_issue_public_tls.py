import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('issuer',pathlib.Path(__file__).with_name('issue-public-tls-v1.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PublicTlsTests(unittest.TestCase):
    def test_wrong_host_stops_before_writes_or_docker(self):
        with patch.object(module.socket,'gethostname',return_value='wandora-vps-01'),patch.object(module.os,'geteuid',return_value=0),patch.object(module,'command') as called:
            with self.assertRaisesRegex(RuntimeError,'somente no 28server'):
                module.main()
            called.assert_not_called()

    def test_token_rejects_control_characters_and_ini_injection(self):
        for value in ['short','a'*30+'\nother=value','a'*257,'a'*30+' value']:
            with self.assertRaisesRegex(RuntimeError,'Formato'):
                module.validate_token(value)
        self.assertEqual(module.validate_token('A_b-'*10),'A_b-'*10)

    def test_real_certificate_pair_chain_hostname_and_expiry(self):
        with tempfile.TemporaryDirectory() as directory:
            base=pathlib.Path(directory)
            def ssl(*args):
                subprocess.run(['openssl',*args],cwd=base,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            ssl('req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout','ca.key','-out','ca.pem','-subj','/CN=Disposable CA','-addext','basicConstraints=critical,CA:TRUE')
            ssl('req','-new','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=dsh-mcp.wandora.com.br')
            (base/'server.ext').write_text('basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:dsh-mcp.wandora.com.br\nextendedKeyUsage=serverAuth\n')
            for days,cert in [('14','server.pem'),('1','short.pem')]:
                ssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days',days,'-extfile','server.ext','-out',cert)
            cert,key,chain=base/'server.pem',base/'server.key',base/'ca.pem'
            module.validate_pair(cert,key,chain,trust_file=chain)
            with self.assertRaises(RuntimeError):
                module.validate_pair(cert,key,chain,hostname='wrong.example',trust_file=chain)
            with self.assertRaises(RuntimeError):
                module.validate_pair(base/'short.pem',key,chain,trust_file=chain)
            with self.assertRaisesRegex(RuntimeError,'nao correspondem'):
                module.validate_pair(cert,base/'ca.key',chain,trust_file=chain)

    def test_existing_destination_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'private'
            module.create_file(path,b'first')
            with self.assertRaises(FileExistsError):
                module.create_file(path,b'second')
            self.assertEqual(path.read_bytes(),b'first')
            self.assertEqual(path.stat().st_mode&0o777,0o600)

if __name__=='__main__':
    unittest.main()
