# Contributing

Bug reports, protocol observations, translations, and focused pull requests are welcome. Use the setup instructions in [README.md](README.md).

## Working on a change

Keep changes focused on a specific behavior. Follow the existing module boundaries: protocol parsing in `mttl.rs`, storage in `db.rs`, connection handling in `server.rs`, and hardware access through `src/api.ts`. Keep user-facing wording short and describe what the device actually reported.

Before opening a pull request:

```sh
bun run format
cargo fmt --manifest-path src-tauri/Cargo.toml
bun run check
bun run build
bun run check:rust
```

Commit both lockfiles when changing dependencies. The Checks workflow compiles the desktop executable on Linux. The Release workflow runs Rust checks and packages installers on Linux, Windows, and macOS; see [the release process](docs/RELEASING.md).

Tests should exercise behavior that could fail: malformed frames, incomplete telemetry, stale data, reconnects, command confirmation, database migration, and invalid setup inputs. A queued command is not a successful hardware operation. Use documented test IPs and invented MAC addresses in fixtures.

For frontend changes, inspect affected screens in Arabic and English, both themes, and at the minimum desktop size of 960 × 640. Check keyboard access, visible focus, control labels, empty states, and errors. Preserve equipment names, SSIDs, MACs, protocol frames, and units when translating. Add new English strings to the Arabic dictionaries; do not translate user-authored values.

For protocol changes, distinguish captured evidence from assumptions. Include sanitized frames, device model, firmware, and the test procedure. Do not treat unknown fields as confirmed measurements. Changes that affect power switching must include the hardware test result or state explicitly that physical hardware was unavailable.

## Reporting a bug

Include the app version or commit, operating system, device model and firmware if relevant, reproduction steps, and expected versus observed behavior. Screenshots and sanitized logs help. Remove Wi-Fi passwords, private names, and identifying network information before sharing captures or a database.

Report exploitable security issues privately as described in [SECURITY.md](SECURITY.md).

By submitting a contribution, you agree to license your original contribution under the project's [MIT license](LICENSE). Preserve third-party attribution and license files when adding assets or code from another project.
