import hashlib
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('installer',pathlib.Path(__file__).with_name('install-existing-profile-v1.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InstallerGuards(unittest.TestCase):
    def test_image_identity_accepts_only_reviewed_config_or_manifest(self):
        config='sha256:3d0d025371a574c4e711e5c0e110ff003bf0f9a6c01e6d263d81fdad2f3e8476'
        digest=module.IMAGE.split('@')[1]
        descriptor={'digest':digest,'mediaType':'application/vnd.docker.distribution.manifest.v2+json','size':4707}
        module.verify_candidate_identity({'Id':config,'Os':'linux','Architecture':'amd64'})
        good={'Id':digest,'Descriptor':descriptor,'RepoDigests':[module.IMAGE],'Os':'','Architecture':''}
        module.verify_candidate_identity(good)
        for change in [{'Id':'sha256:'+'f'*64},{'Descriptor':{**descriptor,'digest':'sha256:'+'f'*64}},
                       {'RepoDigests':[]},{'Architecture':'arm64'},{'Os':'windows'}]:
            with self.assertRaises(RuntimeError):
                module.verify_candidate_identity({**good,**change})

    def test_cleanup_refuses_unrelated_container_and_unconfirmed_daemon(self):
        with tempfile.TemporaryDirectory() as directory:
            cidfile=pathlib.Path(directory)/'id'
            cidfile.write_text('c'*64)
            for status,stdout,stderr in [(0,b'other-image unrelated-operation\n',b''),(1,b'',b'Cannot connect to the Docker daemon')]:
                result=type('Result',(),{'stdout':stdout,'stderr':stderr,'returncode':status})()
                with patch.object(module.subprocess,'run',return_value=result) as run:
                    with self.assertRaises(RuntimeError):
                        module.close_installer(cidfile,'known-name')
                    self.assertEqual(run.call_count,1)

    def test_timeout_stops_only_recorded_installer_before_returning(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            script=root/'install.mjs';script.write_text('reviewed fixture')
            digest=hashlib.sha256(script.read_bytes()).hexdigest()
            container='c'*64
            calls=[]
            def docker(args,**kwargs):
                calls.append(args)
                value=b''
                if args[:2]==['docker','run']:
                    if '--cidfile' in args:
                        pathlib.Path(args[args.index('--cidfile')+1]).write_text(container)
                    raise subprocess.TimeoutExpired(args,600)
                if args[:3]==['docker','container','inspect']:
                    value=(module.IMAGE+' deepharness-mcp-disabled-install-v1\n').encode()
                elif args[:3]==['docker','image','inspect']:
                    value=b'sha256:3d0d025371a574c4e711e5c0e110ff003bf0f9a6c01e6d263d81fdad2f3e8476\n'
                elif args[:2]==['docker','inspect']:
                    value=b'deepharness_dsh_data\n' if '.Mounts' in args[3] else b'ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075\n'
                elif 'du' in args:
                    value=b'1 /data/dsh/profiles/web\n'
                return type('Result',(),{'stdout':value,'stderr':b'','returncode':0})()
            with patch.object(module,'ROOT',root),patch.object(module,'SOURCE',script),patch.object(module,'EXPECTED_SCRIPT_SHA',digest),patch.object(module.socket,'gethostname',return_value='28server'),patch.object(module.os,'geteuid',return_value=0),patch.object(module.os,'chown'),patch.object(module.subprocess,'run',side_effect=docker):
                with self.assertRaises(subprocess.TimeoutExpired):
                    module.main()
            self.assertIn(['docker','rm','-f',container],calls)
            self.assertTrue((root/'backups').is_dir())

    def test_wrong_host_does_not_execute_docker(self):
        with patch.object(module.socket,'gethostname',return_value='wandora-vps-01'),patch.object(module.os,'geteuid',return_value=0),patch.object(module.subprocess,'run') as run:
            with self.assertRaisesRegex(RuntimeError,'somente no 28server'):
                module.main()
            run.assert_not_called()

    def test_modified_script_refuses_before_any_docker_or_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            script=root/'install.mjs';script.write_text('unreviewed')
            with patch.object(module,'ROOT',root),patch.object(module,'SOURCE',script),patch.object(module.socket,'gethostname',return_value='28server'),patch.object(module.os,'geteuid',return_value=0),patch.object(module.subprocess,'run') as run:
                with self.assertRaisesRegex(RuntimeError,'Script de instalacao diferente'):
                    module.main()
                run.assert_not_called()
                self.assertFalse((root/'backups').exists())

    def test_different_live_image_refuses_before_backup_or_install(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            script=root/'install.mjs';script.write_text('reviewed fixture')
            digest=hashlib.sha256(script.read_bytes()).hexdigest()
            result=type('Result',(),{'stdout':b'other-image\n'})()
            with patch.object(module,'ROOT',root),patch.object(module,'SOURCE',script),patch.object(module,'EXPECTED_SCRIPT_SHA',digest),patch.object(module.socket,'gethostname',return_value='28server'),patch.object(module.os,'geteuid',return_value=0),patch.object(module.subprocess,'run',return_value=result) as run:
                with self.assertRaisesRegex(RuntimeError,'Imagem atual diferente'):
                    module.main()
                self.assertEqual(run.call_count,1)
                self.assertFalse((root/'backups').exists())

if __name__=='__main__':
    unittest.main()
