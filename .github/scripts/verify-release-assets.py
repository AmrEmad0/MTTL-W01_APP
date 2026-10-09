"""Require every selected installer for this version before writing checksums."""

import hashlib
from pathlib import Path
import sys


def expected_assets(version: str, platform: str = "all") -> set[str]:
    if platform not in ("all", "windows"):
        raise ValueError(f"Unsupported release platform: {platform}")
    prefix = f"MTTL-Control_{version}_"
    expected = {
        prefix + suffix
        for suffix in (
            "linux_amd64.deb",
            "linux_x86_64.rpm",
            "linux_amd64.AppImage",
            "windows_x64-setup.exe",
            "windows_x64.msi",
            "darwin_aarch64.dmg",
            "darwin_x64.dmg",
        )
    }
    if platform == "windows":
        expected = {name for name in expected if name.startswith(prefix + "windows_")}
    return expected


def verify_assets(directory: Path, version: str, platform: str = "all") -> Path:
    files = sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.name != "SHA256SUMS.txt"
    )
    missing = expected_assets(version, platform) - {path.name for path in files}
    if missing:
        raise ValueError("Missing release assets: " + ", ".join(sorted(missing)))
    for path in files:
        if not path.name.startswith(f"MTTL-Control_{version}_"):
            raise ValueError(f"Unexpected version or asset name: {path.name}")
        if path.stat().st_size == 0:
            raise ValueError(f"Empty release asset: {path.name}")

    checksums = []
    for path in files:
        with path.open("rb") as file:
            digest = hashlib.file_digest(file, "sha256").hexdigest()
        checksums.append(f"{digest}  {path.name}\n")
    output = directory / "SHA256SUMS.txt"
    output.write_text("".join(checksums))
    return output


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("Usage: verify-release-assets.py ASSET_DIRECTORY VERSION [all|windows]")
    try:
        platform = sys.argv[3] if len(sys.argv) == 4 else "all"
        result = verify_assets(Path(sys.argv[1]), sys.argv[2], platform)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(f"Verified {platform} installers and wrote {result}.")
