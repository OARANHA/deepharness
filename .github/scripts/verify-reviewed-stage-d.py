"""Validate fixed reviewed artifact before registry login/load/push. No network."""
import hashlib, json, pathlib, sys, zipfile
SOURCE = 'f5a5a4f75b680fa1866d843014ea61e7a5e40506'
TREE = 'ae2893fced36b1662a802df11a8771d3cd290a43'
RUNS = (39004711244, 39004711250)
ARTIFACT = 12090193878
DIGEST = 'ed087c3d15375a518bb75c6ee083767cb4673f4495a6ba5d510d99ae10c7049d'
IMAGES = {'local/stage-d-mcp:tested': 'sha256:cec5b1aaa1948170c2bc731815dda1db20b18f1b66096717a5ccb4e54ad3de51',
          'local/stage-d-grants:tested': 'sha256:55eb4164bb47c8aff900156d3540b85e40d18da71b8fede1e8301a52bc7b6041'}
TARBALL = 'wandora-deepharness-chatgpt-mcp-read-0.1.0-lab.5.tgz'
FILES = {'source-head.txt', 'source-tree.txt', 'images.json', 'packed-files.json', 'SHA256SUMS',
         'EVIDENCE_SHA256SUMS', 'candidate-images.tar.gz', TARBALL}
def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()
def metadata(root):
    for run in RUNS:
        data = json.loads((root / f'run-{run}.json').read_text())
        assert data['id'] == run and data['status'] == 'completed' and data['conclusion'] == 'success'
        assert data['head_sha'] == SOURCE and data['event'] == 'pull_request'
        assert data['repository']['full_name'] == 'OARANHA/deepharness'
    a = json.loads((root / 'artifact.json').read_text())
    assert a['id'] == ARTIFACT and not a['expired']
    assert a['name'] == f'stage-d-integrated-candidates-{SOURCE}'
    assert a['digest'] == 'sha256:' + DIGEST and a['size_in_bytes'] == 538243220
    assert a['workflow_run']['id'] == RUNS[0] and a['workflow_run']['head_sha'] == SOURCE
    source = json.loads((root / 'source.json').read_text())
    assert source['sha'] == SOURCE and source['commit']['tree']['sha'] == TREE

def archive(root):
    assert sha(root / 'artifact.zip') == DIGEST
    dest = root / 'verified'
    dest.mkdir()
    with zipfile.ZipFile(root / 'artifact.zip') as z:
        assert len(z.infolist()) == len(FILES) and set(z.namelist()) == FILES
        for f in z.infolist():
            assert not f.is_dir() and f.file_size <= 2 * 1024**3
            assert (f.external_attr >> 16) & 0o170000 != 0o120000
        z.extractall(dest)
    assert (dest / 'source-head.txt').read_text().strip() == SOURCE
    assert (dest / 'source-tree.txt').read_text().strip() == TREE
    def checksums(filename, expected):
        seen = set()
        for line in (dest / filename).read_text().splitlines():
            digest, path = line.split()
            assert path in expected and path not in seen and sha(dest / path) == digest
            seen.add(path)
        assert seen == expected
    checksums('SHA256SUMS', {TARBALL})
    checksums('EVIDENCE_SHA256SUMS', {'candidate-images.tar.gz', 'images.json', 'packed-files.json',
                                  'source-head.txt', 'source-tree.txt'})
    p = json.loads((dest / 'packed-files.json').read_text())
    assert p['sourceSha'] == SOURCE and p['tarball'] == TARBALL and p['tarSha256'] == sha(dest / TARBALL)
    images = json.loads((dest / 'images.json').read_text())
    assert len(images) == 2
    for tag, image_id in IMAGES.items():
        matches = [i for i in images if tag in i['RepoTags']]
        assert len(matches) == 1 and matches[0]['Id'] == image_id
    assert next(i for i in images if 'local/stage-d-mcp:tested' in i['RepoTags'])['Config']['Labels']['org.opencontainers.image.revision'] == SOURCE

if __name__ == '__main__':
    try:
        mode, folder = sys.argv[1:]
        assert mode in ('metadata', 'archive')
        (metadata if mode == 'metadata' else archive)(pathlib.Path(folder))
        print('REVIEWED_STAGE_D_' + mode.upper() + '_MATCH')
    except Exception:
        raise SystemExit('Reviewed Stage D publication verification denied')
