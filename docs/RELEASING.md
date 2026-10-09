# Publishing a release

The public repository is [AmrEmad0/MTTL-W01_APP](https://github.com/AmrEmad0/MTTL-W01_APP). Its first release is **MTTL Control 0.0.1 Alpha**, tagged `v0.0.1-alpha.1` and marked as a prerelease.

Normal branch pushes and pull requests run the Checks workflow. Pushing a version tag runs the Release workflow, which checks all manifest versions and `Cargo.lock`, builds installers on Linux, Windows, and both Mac architectures, attaches downloads to a draft, and publishes it after all builds succeed. All seven expected installers must be present, have the correct version and architecture, and be nonempty. Installer checksums are attached as `SHA256SUMS.txt`. Alpha releases do not replace GitHub's latest stable release.

## First public publication

Prepare a separate local repository from the verified source files, with a single initial commit on `main`, no old Git history or tags, and the public repository as `origin`. Include the README screenshot, release notes, source, license notices, and both lockfiles. Exclude `.git`, dependencies, build outputs, local databases, captures, and credentials. Keep the original development checkout intact.

Run these checks before committing the source:

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun run check:rust
python3 power_d.py selftest
python3 -m unittest discover -s tests -p 'test_*.py'
RELEASE_TAG=v0.0.1-alpha.1 REF_TYPE=tag python3 .github/scripts/check-release.py
```

The prepared local repository should have an annotated `v0.0.1-alpha.1` tag on its initial commit. Verify `git status`, `git log --oneline`, `git remote -v`, and `git show v0.0.1-alpha.1` before publication.

After the maintainer approves publication, run the following **from the prepared public checkout**:

```sh
git push --atomic origin main v0.0.1-alpha.1
```

This publishes the source and starts the automatic release immediately. No pull request or manual release creation is needed. Do not push the tag while still preparing or reviewing the source.

Automatic Dependabot version PRs are disabled for the alpha with `open-pull-requests-limit: 0`; the frontend ecosystem is `bun`. Security-update PRs are controlled separately by the repository's GitHub settings. Re-enable version updates when ready for an ongoing contribution workflow.

## Create a version

1. Update `version` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together. Run `cargo check --manifest-path src-tauri/Cargo.toml` to update the package version in `Cargo.lock`.
2. Write `docs/releases/vVERSION.md` with changes, installation notes, and known limitations. Include physical-device and platform test results when available.
3. Run `bun run check`, `bun run build`, and `bun run check:rust`. Review the dependency audits and bundled licenses.
4. Commit the changes and push the branch. Wait for Checks to pass, then push an annotated tag on that commit:

```sh
git push origin main
git tag -a v0.0.1-alpha.2 -m "MTTL Control 0.0.1 Alpha 2"
git push origin v0.0.1-alpha.2
```

Use the new version instead of `v0.0.1-alpha.2` for later releases. Tags with a suffix, such as `v0.0.1-alpha.2`, create a GitHub prerelease. The first heading of the release notes supplies the release title. The workflow rejects malformed tags, versions that disagree with the manifests or lockfile, and missing release notes.

## Failed builds

A Windows test process that exits before running tests with `STATUS_ENTRYPOINT_NOT_FOUND` usually lacks the Common Controls v6 manifest. The build script embeds `src-tauri/windows-app-manifest.xml` through the MSVC linker for both the app and its test executables, following [Tauri's workaround](https://github.com/tauri-apps/tauri/issues/13419#issuecomment-3398457618). Keep this manifest when updating the Windows build.

A failed job leaves the release unpublished as a draft. Inspect its logs in GitHub Actions. For a temporary runner or download error, rerun the workflow on the same tag; it can reuse the draft. A published version cannot be replaced by this workflow.

For a code fix, push the correction on the development branch and create a new version and tag. Do not move an existing published tag. The manual workflow trigger is available for an existing version tag; selecting a branch is rejected.

## Signing and availability

The first release has unsigned Windows installers and ad-hoc macOS signatures. Apple notarization and Windows publisher certificates need separate configuration; automatic updates also require a dedicated signing key and updater integration. See Tauri's [macOS](https://v2.tauri.app/distribute/sign/macos/) and [Windows](https://v2.tauri.app/distribute/sign/windows/) signing guides before changing the release process.

Release creation uses GitHub's built-in workflow token, with write access restricted to release jobs. No personal token is required. The workflows pin actions by commit and install frontend dependencies with the lockfile.

Repository visibility controls who can access the source and downloads. A release in a private repository is private; publishing a release does not make the repository public.
