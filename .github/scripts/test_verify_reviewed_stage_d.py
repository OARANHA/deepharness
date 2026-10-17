import hashlib, importlib.util, json, pathlib, tempfile, unittest, zipfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('verifier',pathlib.Path(__file__).with_name('verify-reviewed-stage-d.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class ReviewedArtifactTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def metadata(self):
        for run in v.RUNS:
            (self.root/f'run-{run}.json').write_text(json.dumps({'id':run,'status':'completed','conclusion':'success',
                'head_sha':v.SOURCE,'event':'pull_request','repository':{'full_name':'OARANHA/deepharness'}}))
        (self.root/'artifact.json').write_text(json.dumps({'id':v.ARTIFACT,'expired':False,
            'name':'stage-d-integrated-candidates-'+v.SOURCE,'digest':'sha256:'+v.DIGEST,
            'size_in_bytes':538243220,'workflow_run':{'id':v.RUNS[0],'head_sha':v.SOURCE}}))
        (self.root/'source.json').write_text(json.dumps({'sha':v.SOURCE,'commit':{'tree':{'sha':v.TREE}}}))
    def test_exact_metadata_and_changed_authority_deny(self):
        self.metadata();v.metadata(self.root)
        for filename,key,value in [('artifact.json','expired',True),('artifact.json','digest','sha256:bad'),
            (f'run-{v.RUNS[0]}.json','head_sha','a'*40),(f'run-{v.RUNS[1]}.json','conclusion','failure')]:
            self.metadata();p=self.root/filename;d=json.loads(p.read_text());d[key]=value;p.write_text(json.dumps(d))
            with self.assertRaises(AssertionError):v.metadata(self.root)
    def fixture_zip(self,extra=None,wrong_image=False):
        blobs={'source-head.txt':(v.SOURCE+'\n').encode(),'source-tree.txt':(v.TREE+'\n').encode(),
            'candidate-images.tar.gz':b'fixture saved image only',v.TARBALL:b'fixture tarball only'}
        images=[{'Id':image_id,'RepoTags':[tag],'Config':{'Labels':{'org.opencontainers.image.revision':v.SOURCE}}}
                for tag,image_id in v.IMAGES.items()]
        if wrong_image:images[0]['Id']='sha256:'+'0'*64
        blobs['images.json']=json.dumps(images).encode()
        blobs['packed-files.json']=json.dumps({'sourceSha':v.SOURCE,'tarball':v.TARBALL,
            'tarSha256':hashlib.sha256(blobs[v.TARBALL]).hexdigest()}).encode()
        blobs['SHA256SUMS']=(hashlib.sha256(blobs[v.TARBALL]).hexdigest()+'  '+v.TARBALL+'\n').encode()
        names=['candidate-images.tar.gz','images.json','packed-files.json','source-head.txt','source-tree.txt']
        blobs['EVIDENCE_SHA256SUMS']=''.join(hashlib.sha256(blobs[x]).hexdigest()+'  '+x+'\n' for x in names).encode()
        if extra:blobs[extra]=b'not allowed'
        with zipfile.ZipFile(self.root/'artifact.zip','w') as z:
            for name,data in blobs.items():z.writestr(name,data)
        return v.sha(self.root/'artifact.zip')
    def test_archive_checksums_paths_source_and_config_id(self):
        digest=self.fixture_zip()
        with patch.object(v,'DIGEST',digest):v.archive(self.root)
        self.assertTrue((self.root/'verified'/v.TARBALL).is_file())
    def test_unknown_paths_and_wrong_image_deny(self):
        for options in ({'extra':'../escape'},{'wrong_image':True}):
            with tempfile.TemporaryDirectory() as tmp:
                previous=self.root;self.root=pathlib.Path(tmp)
                try:
                    digest=self.fixture_zip(**options)
                    with patch.object(v,'DIGEST',digest),self.assertRaises(AssertionError):v.archive(self.root)
                finally:self.root=previous
    def test_tampered_zip_denies_before_extraction(self):
        digest=self.fixture_zip()
        with open(self.root/'artifact.zip','ab') as f:f.write(b'tampered')
        with patch.object(v,'DIGEST',digest),self.assertRaises(AssertionError):v.archive(self.root)
        self.assertFalse((self.root/'verified').exists())
if __name__=='__main__':unittest.main()
