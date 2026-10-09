"""Check release versions, MSI compatibility, the lockfile, and notes."""

import json
import os
from pathlib import Path
import re
import tomllib


def check_msi_version(version: str, override: str | None) -> None:
    msi_version = override if override is not None else version.replace("-", ".", 1)
    setting = "bundle.windows.wix.version"
    if not isinstance(msi_version, str) or not re.fullmatch(
        r"[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?", msi_version
    ):
        raise ValueError(
            f"Set {setting} to a numeric major.minor.patch[.build] version "
            f"for MSI packaging of {version}."
        )

    components = [int(part) for part in msi_version.split(".")]
    for part, value, maximum in zip(
        ("major", "minor", "patch", "build"), components, (255, 255, 65535, 65535)
    ):
        if value > maximum:
            raise ValueError(f"{setting}: {part} cannot exceed {maximum}.")

    core = [int(part) for part in version.split("-", 1)[0].split(".")]
    if components[:3] != core:
        raise ValueError(f"{setting}: major.minor.patch must match app version {version}.")


def check_release(tag: str, ref_type: str, root: Path) -> dict[str, str]:
    number = r"(?:0|[1-9][0-9]*)"
    identifier = r"(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    if ref_type != "tag" or not re.fullmatch(
        rf"v{number}\.{number}\.{number}(?:-{identifier}(?:\.{identifier})*)?", tag
    ):
        raise ValueError("Select a version tag such as v0.0.1-alpha.1, not a branch.")

    version = tag[1:]
    lockfile = tomllib.loads((root / "src-tauri/Cargo.lock").read_text())
    app_packages = [p for p in lockfile["package"] if p["name"] == "mttl-control"]
    if len(app_packages) != 1:
        raise ValueError("Cargo.lock must contain exactly one mttl-control package.")
    config = json.loads((root / "src-tauri/tauri.conf.json").read_text())
    manifests = {
        "package.json": json.loads((root / "package.json").read_text())["version"],
        "src-tauri/tauri.conf.json": config["version"],
        "src-tauri/Cargo.toml": tomllib.loads(
            (root / "src-tauri/Cargo.toml").read_text()
        )["package"]["version"],
        "src-tauri/Cargo.lock": app_packages[0]["version"],
    }
    for path, manifest_version in manifests.items():
        if manifest_version != version:
            raise ValueError(f"{path}: version {manifest_version} does not match {tag}.")

    check_msi_version(
        version, config.get("bundle", {}).get("windows", {}).get("wix", {}).get("version")
    )

    notes = root / "docs/releases" / f"{tag}.md"
    if not notes.is_file() or not notes.read_text().strip():
        raise ValueError(f"Write release notes in docs/releases/{tag}.md before publishing.")
    heading = notes.read_text().splitlines()[0]
    if not heading.startswith("# ") or not heading[2:].strip():
        raise ValueError("Release notes must begin with a '# Release title' heading.")

    return {
        "version": version,
        "title": heading[2:].strip(),
        "prerelease": str("-" in version).lower(),
    }


if __name__ == "__main__":
    try:
        result = check_release(
            os.environ.get("RELEASE_TAG", ""), os.environ.get("REF_TYPE", ""), Path.cwd()
        )
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(str(error)) from error
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a") as file:
            for key, value in result.items():
                file.write(f"{key}={value}\n")
    print(f"Validated {result['version']}, all manifests, MSI version, Cargo.lock, and release notes.")
