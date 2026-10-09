# Third-party notices

The MIT license in this repository applies to original MTTL Control code and documentation. Dependencies and bundled assets retain their respective licenses.

- **Rubik font** — copyright The Rubik Project Authors; SIL Open Font License 1.1. The complete license is [src/assets/fonts/LICENSE-Rubik.txt](src/assets/fonts/LICENSE-Rubik.txt), also included in packaged resources.
- **React and React DOM** — Meta Platforms, Inc. and affiliates; MIT. See [licenses/React.txt](licenses/React.txt).
- **Scheduler** — Meta Platforms, Inc. and affiliates; MIT. See [licenses/Scheduler.txt](licenses/Scheduler.txt).
- **Lucide React icons** — Lucide contributors and Feather contributors; ISC and MIT attribution. See [licenses/Lucide.txt](licenses/Lucide.txt).
- **Tauri JavaScript API** — the Tauri Programme within the Commons Conservancy; MIT or Apache-2.0. Both license texts are in `licenses/`.
- **SQLite** — public domain. The Rust build uses the bundled SQLite distributed by `libsqlite3-sys` through `rusqlite`.

Rust dependencies and operating-system libraries have their own notices. Their license identifiers are available in Cargo package metadata (`cargo metadata --manifest-path src-tauri/Cargo.toml`). Review the dependency set for the target platform when redistributing a packaged build.
