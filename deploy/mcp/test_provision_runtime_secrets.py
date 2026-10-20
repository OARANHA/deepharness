"""Disposable local fixture; never reads operational secrets."""
import importlib.util
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('provision', pathlib.Path(__file__).with_name('provision-runtime-secrets-v1.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProvisionTests(unittest.TestCase):
    def test_wrong_host_creates_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / 'mcp'
            with patch.object(module, 'ROOT', root), patch.object(module.socket, 'gethostname', return_value='wandora-vps-01'):
                with self.assertRaisesRegex(RuntimeError, 'somente no 28server'):
                    module.provision()
            self.assertFalse(root.exists())

    @unittest.skipUnless(os.geteuid() == 0 and os.environ.get('GITHUB_ACTIONS') == 'true', 'actual UID/GID fixture runs as root in CI')
    def test_real_keys_ownership_and_refusal_to_replace_existing_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / 'mcp'
            with patch.object(module, 'ROOT', root), patch.object(module.socket, 'gethostname', return_value='28server'):
                module.provision()
                admin = root / 'secrets/admin-db-password'
                reader = root / 'secrets/runtime-db-password'
                self.assertRegex(admin.read_text(), r'^[0-9a-f]{64}\n$')
                self.assertNotEqual(admin.read_text(), reader.read_text())
                self.assertEqual((admin.stat().st_uid, admin.stat().st_gid, admin.stat().st_mode & 0o777), (999,999,0o400))
                self.assertEqual((reader.stat().st_uid, reader.stat().st_gid, reader.stat().st_mode & 0o777), (1000,999,0o440))
                before = admin.read_bytes()
                with self.assertRaisesRegex(RuntimeError, 'ja existe'):
                    module.provision()
                self.assertEqual(admin.read_bytes(), before)
                for role, prefix in [('backend','backend-server'),('proxy','proxy-backend-client')]:
                    base = root / 'tls' / role
                    self.assertEqual(base.stat().st_mode & 0o777, 0o500)
                    self.assertEqual((base / (prefix+'-key.pem')).stat().st_mode & 0o777, 0o400)
                    self.assertFalse((base/'backend-ca.key').exists())

    def test_real_crypto_and_no_overwrite_without_changing_local_uid_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / 'mcp'
            with patch.object(module, 'ROOT', root), patch.object(module.os, 'geteuid', return_value=0), patch.object(module.socket, 'gethostname', return_value='28server'), patch.object(module.os, 'chown'), patch.object(module.os, 'fchown'):
                module.provision()
                before = (root/'secrets/admin-db-password').read_bytes()
                self.assertEqual((root/'tls/backend/backend-server-key.pem').stat().st_mode & 0o777, 0o400)
                self.assertTrue((root/'tls/proxy/proxy-backend-client-chain.pem').read_text().startswith('-----BEGIN CERTIFICATE-----'))
                with self.assertRaisesRegex(RuntimeError, 'ja existe'):
                    module.provision()
                self.assertEqual((root/'secrets/admin-db-password').read_bytes(), before)

    def test_symbolic_parent_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            base = pathlib.Path(directory)
            (base/'link').symlink_to(base, target_is_directory=True)
            with patch.object(module, 'ROOT', base/'link'/'mcp'), patch.object(module.os, 'geteuid', return_value=0), patch.object(module.socket, 'gethostname', return_value='28server'):
                with self.assertRaisesRegex(RuntimeError, 'Ancestral'):
                    module.provision()
            self.assertFalse((base/'mcp').exists())

if __name__ == '__main__':
    unittest.main()
