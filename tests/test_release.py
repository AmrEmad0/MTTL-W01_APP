"""Release gates must reject mismatched versions and incomplete downloads."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / ".github/scripts" / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load_script("check-release")
assets = load_script("verify-release-assets")


class ReleaseTests(unittest.TestCase):
    def test_current_release_metadata(self):
        version = json.loads((ROOT / "package.json").read_text())["version"]
        result = release.check_release(f"v{version}", "tag", ROOT)
        self.assertEqual(result["version"], version)
        self.assertEqual(result["prerelease"], str("-" in version).lower())
        self.assertTrue(result["title"].startswith("MTTL Control "))

    def test_rejects_branches_and_malformed_tags(self):
        for tag, ref in [
            ("main", "branch"),
            ("v0.0.1-alpha.1", "branch"),
            ("v00.0.1", "tag"),
            ("v0.0.1-alpha..1", "tag"),
            ("v0.0.1-alpha.01", "tag"),
            ("v0.0.1-", "tag"),
        ]:
            with self.subTest(tag=tag, ref=ref), self.assertRaises(ValueError):
                release.check_release(tag, ref, ROOT)

    def test_rejects_mismatched_manifests_and_lockfile(self):
        version = json.loads((ROOT / "package.json").read_text())["version"]
        paths = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]
        for changed in paths:
            with self.subTest(path=changed), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                for name in paths:
                    destination = root / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    content = (ROOT / name).read_text()
                    if name == changed:
                        content = content.replace(version, "99.0.0", 1)
                    destination.write_text(content)
                with self.assertRaisesRegex(ValueError, changed):
                    release.check_release(f"v{version}", "tag", root)

    def test_rejects_missing_release_notes(self):
        version = json.loads((ROOT / "package.json").read_text())["version"]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]:
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes((ROOT / name).read_bytes())
            with self.assertRaisesRegex(ValueError, "release notes"):
                release.check_release(f"v{version}", "tag", root)


class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.version = "0.0.1-alpha.1"
        for name in assets.expected_assets(self.version):
            (self.directory / name).write_bytes(b"installer fixture")

    def test_complete_assets_have_deterministic_checksums(self):
        output = assets.verify_assets(self.directory, self.version)
        expected_hash = hashlib.sha256(b"installer fixture").hexdigest()
        expected = "".join(
            f"{expected_hash}  {name}\n"
            for name in sorted(assets.expected_assets(self.version))
        )
        self.assertEqual(output.read_text(), expected)
        self.assertEqual(assets.verify_assets(self.directory, self.version).read_text(), expected)

    def test_missing_architecture_never_writes_checksums(self):
        (self.directory / f"MTTL-Control_{self.version}_darwin_aarch64.dmg").unlink()
        with self.assertRaisesRegex(ValueError, "Missing release assets"):
            assets.verify_assets(self.directory, self.version)
        self.assertFalse((self.directory / "SHA256SUMS.txt").exists())

    def test_empty_installer_never_writes_checksums(self):
        (self.directory / sorted(assets.expected_assets(self.version))[0]).write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "Empty release asset"):
            assets.verify_assets(self.directory, self.version)
        self.assertFalse((self.directory / "SHA256SUMS.txt").exists())

    def test_wrong_version_never_writes_checksums(self):
        (self.directory / "MTTL-Control_0.1.0_linux_amd64.deb").write_bytes(b"old installer")
        with self.assertRaisesRegex(ValueError, "Unexpected version"):
            assets.verify_assets(self.directory, self.version)
        self.assertFalse((self.directory / "SHA256SUMS.txt").exists())


if __name__ == "__main__":
    unittest.main()
