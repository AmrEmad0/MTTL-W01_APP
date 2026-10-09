"""Require every supported installer for this version before writing checksums."""

import hashlib
from pathlib import Path
import sys


def expected_assets(version: str) -> set[str]:
    prefix = f"MTTL-Control_{version}_"
    return {
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


def verify_assets(directory: Path, version: str) -> Path:
    files = sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.name != "SHA256SUMS.txt"
    )
    missing = expected_assets(version) - {path.name for path in files}
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
    if len(sys.argv) != 3:
        raise SystemExit("Usage: verify-release-assets.py ASSET_DIRECTORY VERSION")
    try:
        result = verify_assets(Path(sys.argv[1]), sys.argv[2])
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(f"Verified all seven installers and wrote {result}.")
