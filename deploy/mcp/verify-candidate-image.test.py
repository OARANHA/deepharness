import importlib.util,pathlib,unittest,copy
spec=importlib.util.spec_from_file_location('image_verifier',pathlib.Path(__file__).with_name('verify-candidate-image.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class ImageIdentityTest(unittest.TestCase):
    def fixture(self):
        return ({'Id':v.MANIFEST,'Descriptor':{'digest':v.MANIFEST},'RepoDigests':[v.REFERENCE],
            'Os':'linux','Architecture':'amd64','Config':{'Labels':{'org.opencontainers.image.revision':v.SOURCE}}},
            {'schemaVersion':2,'mediaType':'application/vnd.docker.distribution.manifest.v2+json',
                'config':{'digest':v.CONFIG}})
    def test_containerd_manifest_id_is_not_the_config_id(self):
        local,registry=self.fixture();v.verify(local,registry)
    def test_classic_config_id_requires_pinned_repository_digest(self):
        local,registry=self.fixture();local['Id']=v.CONFIG;local.pop('Descriptor');v.verify(local,registry)
    def test_empty_config_platform_and_changed_authority_deny(self):
        for change in [lambda x:x.update(Config=None),lambda x:x.update(Os=''),
            lambda x:x.update(Architecture='arm64'),lambda x:x.update(Id='sha256:'+'0'*64),
            lambda x:x.update(Descriptor={'digest':'sha256:'+'0'*64}),
            lambda x:x.update(RepoDigests=[]),lambda x:x['Config']['Labels'].update({'org.opencontainers.image.revision':'bad'})]:
            local,registry=self.fixture();change(local)
            with self.assertRaises(ValueError):v.verify(local,registry)
        local,registry=self.fixture();registry['config']['digest']='sha256:'+'0'*64
        with self.assertRaises(ValueError):v.verify(local,registry)
if __name__=='__main__':unittest.main()
