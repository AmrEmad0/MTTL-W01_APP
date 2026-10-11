# AppImage catalog fix and future releases

The app is named **MTTL Control**. **MTTL-W01** is the supported hardware model.
Keep the existing repository URL so downloads and catalog links remain valid.

## Fix catalog PR #9985

[The catalog test](https://github.com/AppImage/appimage.github.io/pull/9985)
ran the Linux AppImage from `v0.0.1-alpha.1`. Alpha 2 and Alpha 3 only
contain Windows installers, so they cannot fix that test.

Fresh installations now use Arabic for an Arabic system language and English
for every other language, including an unset language or the C locale. A saved
Arabic or English preference takes priority. The HTML bootstrap and React use
the same rule, including when browser storage is blocked.

The release workflow names Linux downloads without a redundant `linux` token:

- `MTTL-Control_0.0.1-alpha.4_amd64.AppImage`
- `MTTL-Control_0.0.1-alpha.4_amd64.deb`
- `MTTL-Control_0.0.1-alpha.4_x86_64.rpm`

The asset verifier requires these names before generating checksums. Windows
and macOS download naming stays as configured. Linux builds continue using
Ubuntu 22.04; this change does not remove the system glibc requirement.

Prepare a new release with **all** platforms. A Windows-only release does not
produce a corrected AppImage. After the new AppImage is published, test it with
fresh preferences under `LC_ALL=C` and an English locale, then paste `/retest`
into the catalog PR. Check the bot's result before considering the issue fixed.
Ask the catalog maintainer to rename `data/MTTL-W01` to `data/MTTL_Control` to
match the application name in the desktop file. The repository name identifies
the hardware; renaming the GitHub repository is unnecessary for the language fix.

## Development and public release repositories

Use [LG_RUST](https://github.com/AmrEmad0/LG_RUST) for development and
[MTTL-W01_APP](https://github.com/AmrEmad0/MTTL-W01_APP) for reviewed public
source and release downloads. Checks run in both repositories. The release
workflow's prepare job only runs in `AmrEmad0/MTTL-W01_APP`, so tagging the
development repository does not publish installers.

These repositories have separate Git histories. Promote reviewed changes into a
branch based on the current public `main`, then open a production pull request.
Keep existing production fixes when applying development changes, inspect the
diff for private files, and wait for Checks before merging. Do not force-push
the development history over public `main`.

For each release, update `package.json`, `src-tauri/Cargo.toml`, the app package
in `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` to the same version.
Set the numeric MSI version separately, for example `0.0.1.4` for Alpha 4, and
write `docs/releases/v0.0.1-alpha.4.md`.

After the production fix is merged and Checks pass, run from the public checkout:

```sh
git fetch origin main --tags
git tag -a v0.0.1-alpha.4 origin/main -m "MTTL Control 0.0.1 Alpha 4"
git push origin v0.0.1-alpha.4
```

Tagging starts the existing Release workflow. It builds installers, uploads them
to a draft, verifies the complete asset set, writes `SHA256SUMS.txt`, and publishes
the prerelease only after all jobs succeed. Inspect Actions and the release
downloads before requesting the catalog retest. Use a new version for later
releases; keep published tags and binaries immutable.

For a temporary build failure, rerun the same workflow. For a source change,
create a new version. Review public fixes back into development so later
promotions retain the catalog fix.
