# Security

## Network and local access

MTTL Control is a local desktop controller for a device protocol without encryption or authentication. The TCP listener binds to all interfaces on port 10086; custom listeners can be added during setup. A client that reports a valid-looking MAC can identify itself as a strip. MAC registration is not cryptographic authentication.

Restrict controller ports to trusted devices with a firewall or a dedicated device network. Do not expose them to the internet. Network discovery connects to hosts in the selected IPv4 /24 subnet. Provisioning sends Wi-Fi credentials over the device's plaintext setup protocol.

The frontend uses local assets, a content security policy, and a main-window capability limited to the core APIs it needs. Raw protocol commands deliberately allow changes outside the normal relay controls; use that console only when you understand the command.

SQLite stores device identifiers, user-entered names and notes, readings, events, and automation definitions. Protect the application data directory with the operating system's account permissions. The app does not write provisioning passwords to SQLite. Operating-system Wi-Fi tools may store them separately. Raw console output or manually captured traffic can contain sensitive data.

## Dependency audit notes

The pinned Linux dependency graph includes `glib 0.18.5` and `proc-macro-error 1.0.4` through Tauri's GTK 3 / WebKitGTK backend. `cargo audit` reports two upstream advisories:

- [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html): unsound string-variant iterator methods in GLib versions before 0.20. The app does not directly use these methods. This does not establish whether all upstream code avoids them.
- [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html): `proc-macro-error` is unmaintained, with no patched release. It is a build-time dependency of the GTK macros.

GLib 0.20 is outside GTK 3's current 0.18 dependency range, so a direct version override does not update that backend. These advisories remain visible; no audit suppression is configured. Recheck the dependency graph when upgrading Tauri and before distributing a release.

## Reporting an issue

Use the repository's [private vulnerability reporting page](https://github.com/AmrEmad0/MTTL-W01_APP/security/advisories/new) if it is enabled. Otherwise, use the contact information on the [maintainer's GitHub profile](https://github.com/AmrEmad0) to arrange a private report before posting exploit details publicly.

Include the affected commit, operating system, reproduction steps, impact, and a sanitized proof of concept. Do not include live passwords or a database containing personal data. Fixes are developed against the current main branch.
