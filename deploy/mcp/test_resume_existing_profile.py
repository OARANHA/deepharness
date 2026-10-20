import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('resume',pathlib.Path(__file__).with_name('resume-existing-profile-path-v1.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ResumeGuards(unittest.TestCase):
    def fixture(self,root):
        backup=root/'backups';backup.mkdir(mode=0o700)
        profile=backup/'web-before-mcp';profile.mkdir()
        (profile/'package.json').write_text('{"dependencies":{}}')
        return backup,{'package.json':hashlib.sha256((profile/'package.json').read_bytes()).hexdigest(),
                       'pnpm-lock.yaml':None,'package-lock.json':None,'cordis.patch.yml':None,'cordis.yml':None}
    def test_matching_profile_is_read_only(self):
        with tempfile.TemporaryDirectory() as d:
            backup,expected=self.fixture(pathlib.Path(d));calls=[]
            def run(args):
                calls.append(args);return json.dumps(expected).encode()
            m.verify_preinstall_backup(backup,run)
            self.assertEqual(len(calls),1);self.assertEqual(calls[0][:2],['docker','exec'])
            self.assertEqual((backup/'web-before-mcp/package.json').read_text(),'{"dependencies":{}}')
    def test_changed_manifest_or_lock_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            backup,expected=self.fixture(pathlib.Path(d))
            for key in ['package.json','pnpm-lock.yaml','cordis.patch.yml']:
                with self.assertRaisesRegex(RuntimeError,'difere do backup'):
                    m.verify_preinstall_backup(backup,lambda args:json.dumps({**expected,key:'changed'}).encode())
    def test_missing_or_symlink_backup_never_reads_live(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);backup,_=self.fixture(root)
            (backup/'web-before-mcp/package.json').unlink()
            with self.assertRaisesRegex(RuntimeError,'Manifesto'):
                m.verify_preinstall_backup(backup,lambda args:self.fail('must not execute'))
            link=root/'link';link.symlink_to(backup)
            with self.assertRaisesRegex(RuntimeError,'Backup privado'):
                m.verify_preinstall_backup(link,lambda args:self.fail('must not execute'))
    def test_resume_retains_correct_path_and_single_use_ops(self):
        source=pathlib.Path(spec.origin).read_text()
        self.assertIn('PATH=/opt/dsh/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',source)
        self.assertIn('exist_ok=False',source)
        self.assertNotIn("run(['docker','cp'",source)
if __name__=='__main__':unittest.main()
