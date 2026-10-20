"""PREPARE-ONLY: validate the sealed Stage D backend candidate evidence offline.

No Docker, registry, network, credential, profile, or runtime operations.
This checks the existing CI artifact for release review; it does not publish it.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
import sys
import tarfile
from pathlib import Path

SHA = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_PACKAGE_FILES = frozenset({
    "package.json",
    "adapters/private-semantic-http-handler.mjs",
    "adapters/dsh-semantic-bridge.mjs",
    "adapters/authoritative-pg-read-query.mjs",
})
EVIDENCE = frozenset({
    "candidate-images.tar.gz", "images.json", "packed-files.json",
    "source-head.txt", "source-tree.txt",
})
CANONICAL_PARENT = "ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f"

def require(condition):
    if not condition:
        raise ValueError("SEMANTIC_BACKEND_REVIEW_NO_GO")

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def read_regular(root: Path, filename: str) -> bytes:
    require(filename and "/" not in filename and "\\" not in filename
            and filename not in {".", ".."})
    entry = root / filename
    require(not entry.is_symlink() and entry.is_file())
    return entry.read_bytes()

def verify_checksums(root: Path, name: str, expected: frozenset[str]):
    lines = read_regular(root, name).decode("ascii").splitlines()
    found = set()
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", line)
        require(match is not None)
        digest, filename = match.groups()
        require(filename in expected and filename not in found)
        require(sha256(read_regular(root, filename)) == digest)
        found.add(filename)
    require(found == expected)

def validate_review(root: Path, source_sha: str, tree_sha: str):
    """Validate pre-existing artifact bytes. Never extracts or executes them."""
    require(isinstance(root, Path) and root.is_dir() and not root.is_symlink())
    require(isinstance(source_sha, str) and SHA.fullmatch(source_sha))
    require(isinstance(tree_sha, str) and SHA.fullmatch(tree_sha))
    require(read_regular(root, "source-head.txt") == (source_sha + "\n").encode())
    require(read_regular(root, "source-tree.txt") == (tree_sha + "\n").encode())
    verify_checksums(root, "EVIDENCE_SHA256SUMS", EVIDENCE)

    proof = json.loads(read_regular(root, "packed-files.json"))
    require(proof.get("version") == 1 and proof.get("sourceSha") == source_sha)
    require(proof.get("packageVersion") == "0.1.0-lab.7")
    tarball = proof.get("tarball")
    require(isinstance(tarball, str) and re.fullmatch(
        r"wandora-deepharness-chatgpt-mcp-read-0\\.1\\.0-lab\\.7\\.tgz", tarball))
    require(isinstance(proof.get("tarSha256"), str)
            and HEX64.fullmatch(proof["tarSha256"]))
    verify_checksums(root, "SHA256SUMS", frozenset({tarball}))
    archive = read_regular(root, tarball)
    require(sha256(archive) == proof["tarSha256"])

    file_records = proof.get("files")
    require(isinstance(file_records, list) and len(file_records) >= 20)
    expected = {}
    for record in file_records:
        require(isinstance(record, dict) and set(record) == {"path", "sha256"})
        path, digest = record["path"], record["sha256"]
        require(isinstance(path, str) and len(path) <= 256
                and re.fullmatch(r"[A-Za-z0-9_./-]+", path)
                and all(part not in ("", ".", "..") for part in path.split("/")))
        require(isinstance(digest, str) and HEX64.fullmatch(digest)
                and path not in expected)
        expected[path] = digest
    require(REQUIRED_PACKAGE_FILES <= set(expected))
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        members = tar.getmembers()
        seen = set()
        for member in members:
            require(member.isfile() and not member.issym() and not member.islnk())
            require(member.name.startswith("package/"))
            path = member.name[len("package/"):]
            require(path in expected and path not in seen and member.size <= 1024 * 1024)
            data = tar.extractfile(member).read()
            require(sha256(data) == expected[path])
            seen.add(path)
        require(seen == set(expected))

    package = json.loads(tar.extractfile("package/package.json").read()) if False else None
    # Inspect package.json from the already validated archive without extraction.
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        manifest = json.loads(tar.extractfile("package/package.json").read())
    require(manifest.get("name") == "@wandora/deepharness-chatgpt-mcp-read")
    require(manifest.get("version") == "0.1.0-lab.7")
    require(manifest.get("exports", {}).get("./private-semantic-http-handler")
            == "./adapters/private-semantic-http-handler.mjs")

    images = json.loads(read_regular(root, "images.json"))
    require(isinstance(images, list) and len(images) == 2)
    by_name = {}
    for img in images:
        require(isinstance(img, dict) and DIGEST.fullmatch(img.get("Id", "")))
        require(img.get("Os") == "linux" and img.get("Architecture") == "amd64")
        require(isinstance(img.get("RepoTags"), list))
        for name in img["RepoTags"]:
            if name in ("local/stage-d-mcp:tested", "local/stage-d-grants:tested"):
                require(name not in by_name)
                by_name[name] = img
    require(set(by_name) == {"local/stage-d-mcp:tested", "local/stage-d-grants:tested"})
    mcp = by_name["local/stage-d-mcp:tested"]
    config = mcp.get("Config", {})
    require(config.get("Labels", {}).get("org.opencontainers.image.revision") == source_sha)
    require(config.get("User") == "node")
    require(config.get("ExposedPorts") in ({}, None))
    cmd = config.get("Cmd")
    require(isinstance(cmd, list) and "MCP_CANDIDATE_DISABLED" in " ".join(cmd))
    require("run-operational.mjs" not in " ".join(cmd))

    # This file certifies evidence integrity only, NOT a deployed image.
    return {"status": "PREPARE_ONLY", "source_sha": source_sha,
            "package_version": "0.1.0-lab.7",
            "backend_image_id": mcp["Id"], "image_is_published": False,
            "persistent_profile_upgraded": False, "deploy_authorized": False}

if __name__ == "__main__":
    try:
        require(len(sys.argv) == 4)
        report = validate_review(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
        print("SEMANTIC_BACKEND_ARTIFACT=GREEN")
        print("SEMANTIC_BACKEND_IMAGE_ID=" + report["backend_image_id"])
        print("SEMANTIC_BACKEND_DEPLOY=NOT_PERFORMED")
    except (OSError, ValueError, TypeError, json.JSONDecodeError, tarfile.TarError):
        print("SEMANTIC_BACKEND_ARTIFACT=NO_GO", file=sys.stderr)
        sys.exit(1)
