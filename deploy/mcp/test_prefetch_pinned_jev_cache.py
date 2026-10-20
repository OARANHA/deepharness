import importlib.util,json,pathlib,subprocess,unittest
spec=importlib.util.spec_from_file_location('cache',pathlib.Path(__file__).with_name('prefetch-pinned-jev-cache-v1.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
URL='https://codeload.github.com/luobosibing2/dsh-jev-plugin/tar.gz/'+m.COMMIT
class CacheGuards(unittest.TestCase):
    def test_only_exact_public_commit_is_accepted(self):
        self.assertEqual(m.missing_archive('missing '+URL+'.'),URL)
        for url in [URL.replace(m.COMMIT,'f'*40),URL+'?token=private',URL.replace('https:','http:'),URL.replace('codeload.github.com','evil.example'),URL.replace('luobosibing2','other')]:
            with self.assertRaises(RuntimeError):m.missing_archive(url)
    def test_network_stage_mounts_only_store_subpath_and_blocks_scripts(self):
        for offline in (True,False):
            args=m.args_for('test',offline)
            mounts=[args[i+1] for i,x in enumerate(args) if x=='--mount']
            self.assertEqual(mounts,['type=volume,src=deepharness_dsh_data,dst=/cache,volume-subpath=.local/share/pnpm/store'])
            self.assertEqual(args[args.index('--network')+1],'none' if offline else 'bridge')
            self.assertIn('--config.ignore-scripts=true',m.FETCH_JS)
            self.assertNotIn('plugin',m.FETCH_JS)
    def parse(self,resolution):
        key='@dsh-jev/plugin@'+URL
        code=m.MINI_LOCK_JS.replace("require('/opt/wandora-mcp-verifier/node_modules/js-yaml')",'({load:JSON.parse})')
        return subprocess.run(['node','-e',code],input=json.dumps({'packages':{key:{'resolution':resolution}}}),text=True,capture_output=True)
    def test_minimal_lock_preserves_integrity_without_profile_data(self):
        r={'gitHosted':True,'tarball':URL,'integrity':'sha512-'+'A'*86+'=='}
        result=self.parse(r);self.assertEqual(result.returncode,0,result.stderr)
        mini=json.loads(result.stdout)
        self.assertEqual(next(iter(mini['packages'].values()))['resolution'],r)
        self.assertEqual(len(mini['packages']),1)
        self.assertEqual(mini['snapshots'],{next(iter(mini['packages'])):{}})
    def test_bad_integrity_or_credential_url_refused(self):
        base={'gitHosted':True,'tarball':URL,'integrity':'sha512-'+'A'*86+'=='}
        for change in [{'integrity':''},{'gitHosted':False},{'tarball':URL+'?token=private'},{'tarball':URL.replace('codeload.github.com','user:password@codeload.github.com')}]:
            self.assertNotEqual(self.parse({**base,**change}).returncode,0)
if __name__=='__main__':unittest.main()
