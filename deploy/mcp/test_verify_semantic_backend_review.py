"""Offline synthetic checks for the release-evidence verifier; never Docker."""
import copy
import hashlib
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

from verify_semantic_backend_review import validate_review

SOURCE = "a" * 40
TREE = "b" * 40
TARBALL = "wandora-deepharness-chatgpt-mcp-read-0.1.0-lab.7.tgz"
PACKAGE = {
    "name": "@wandora/deepharness-chatgpt-mcp-read",
    "version": "0.1.0-lab.7",
    "exports": {"./private-semantic-http-handler":
                "./adapters/private-semantic-http-handler.mjs"},
}
def digest(data):
    return hashlib.sha256(data).hexdigest()

def put(root, name, data):
    (root / name).write_bytes(data if isinstance(data, bytes) else data.encode())

def sample(root):
    files = {
        "package.json": json.dumps(PACKAGE).encode(),
        "adapters/private-semantic-http-handler.mjs": b"export const safe=true;\n",
        "adapters/dsh-semantic-bridge.mjs": b"export const safe=true;\n",
        "adapters/authoritative-pg-read-query.mjs": b"export const safe=true;\n",
    }
    for i in range(20):
        files[f"adapters/fixture-{i}.mjs"] = b"export const fixture=true;\n"
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as archive:
        for name, data in files.items():
            info = tarfile.TarInfo("package/" + name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    tar_data = out.getvalue()
    put(root, TARBALL, tar_data)
    proof = {
        "version": 1, "sourceSha": SOURCE, "packageVersion": "0.1.0-lab.7",
        "tarball": TARBALL, "tarSha256": digest(tar_data),
        "files": [{"path": p, "sha256": digest(b)} for p, b in files.items()],
    }
    put(root, "packed-files.json", json.dumps(proof))
    put(root, "SHA256SUMS", digest(tar_data) + "  " + TARBALL + "\n")
    put(root, "source-head.txt", SOURCE + "\n")
    put(root, "source-tree.txt", TREE + "\n")
    images = [
        {"Id": "sha256:" + "c"*64, "Os": "linux", "Architecture": "amd64",
         "RepoTags": ["local/stage-d-mcp:tested"],
         "Config": {
             "Labels": {"org.opencontainers.image.revision": SOURCE},
             "User": "node",
             "Cmd": ["node", "--input-type=module", "-e",
                     "console.log('MCP_CANDIDATE_DISABLED');"],
         }},
        {"Id": "sha256:" + "d"*64, "Os": "linux", "Architecture": "amd64",
         "RepoTags": ["local/stage-d-grants:tested"],
         "Config": {"User": "999:999"}},
    ]
    put(root, "images.json", json.dumps(images))
    put(root, "candidate-images.tar.gz", b"fixture saved image bytes")
    evidence = ["candidate-images.tar.gz", "images.json", "packed-files.json",
                "source-head.txt", "source-tree.txt"]
    put(root, "EVIDENCE_SHA256SUMS", "".join(
        digest((root / name).read_bytes()) + "  " + name + "\n"
        for name in evidence))

def resign(root):
    files = ["candidate-images.tar.gz", "images.json", "packed-files.json",
             "source-head.txt", "source-tree.txt"]
    put(root, "EVIDENCE_SHA256SUMS", "".join(
        digest((root / name).read_bytes()) + "  " + name + "\n"
        for name in files))

class EvidenceGate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        sample(self.root)
    def tearDown(self):
        self.tmp.cleanup()
    def verify(self):
        return validate_review(self.root, SOURCE, TREE)
    def test_valid_prepare_only(self):
        report = self.verify()
        self.assertEqual(report["status"], "PREPARE_ONLY")
        self.assertEqual(report["package_version"], "0.1.0-lab.7")
        self.assertFalse(report["deploy_authorized"])
        self.assertFalse(report["image_is_published"])
        self.assertFalse(report["persistent_profile_upgraded"])
    def test_reject_changed_source_or_tree(self):
        with self.assertRaises(ValueError):
            validate_review(self.root, "d"*40, TREE)
        with self.assertRaises(ValueError):
            validate_review(self.root, SOURCE, "d"*40)
    def test_reject_tampered_package_manifest(self):
        original = json.loads((self.root / "packed-files.json").read_text())
        original["sourceSha"] = "d"*40
        put(self.root, "packed-files.json", json.dumps(original))
        resign(self.root)
        with self.assertRaises(ValueError):
            self.verify()
    def test_reject_missing_handler_inside_archive(self):
        proof = json.loads((self.root / "packed-files.json").read_text())
        proof["files"] = [f for f in proof["files"] if
                           f["path"] != "adapters/private-semantic-http-handler.mjs"]
        put(self.root, "packed-files.json", json.dumps(proof))
        resign(self.root)
        with self.assertRaises(ValueError):
            self.verify()
    def test_reject_wrong_image_and_accidental_exposed_port(self):
        images = json.loads((self.root / "images.json").read_text())
        images[0]["Config"]["ExposedPorts"] = {"3443/tcp": {}}
        put(self.root, "images.json", json.dumps(images))
        resign(self.root)
        with self.assertRaises(ValueError):
            self.verify()
    def test_reject_deceptive_release_tag_with_wrong_label(self):
        images = json.loads((self.root / "images.json").read_text())
        images[0]["Config"]["Labels"]["org.opencontainers.image.revision"] = "d"*40
        put(self.root, "images.json", json.dumps(images))
        resign(self.root)
        with self.assertRaises(ValueError):
            self.verify()
    def test_reject_changed_tgz(self):
        with (self.root / TARBALL).open("ab") as stream:
            stream.write(b"tampering")
        with self.assertRaises(ValueError):
            self.verify()

if __name__ == "__main__":
    unittest.main()
