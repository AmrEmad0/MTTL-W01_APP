# Protocol commands and desktop API

The runtime controller accepts strip connections on TCP **10086**. Setup commands go to the strip's access point, usually `192.168.1.1:30300`. These are separate connections. Frames are plaintext and end with CRLF; the protocol console adds the line ending.

The [protocol guide](MTTL_CONTROLLER_PROTOCOL_GUIDE.md) records firmware and evidence levels. Replies below describe the tested MTTL-W01 family. An empty reply is not an acknowledgement, and a queued command is not a confirmed state change.

## Runtime telemetry and relay commands

| Frame                              | Purpose                           | Reported response                                                                                                    |
| ---------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `up:getinfo:all`                   | Request readings for four outlets | `up:getinfo:1:<record>:2:<record>:3:<record>:4:<record>`                                                             |
| `up:power_report:1:vol`            | Request line voltage              | `up:power_report:1:<millivolts>`; `224500` means 224.5 V                                                             |
| `up:query:wifirssi`                | Request Wi-Fi signal strength     | `up:query:<dBm>`                                                                                                     |
| `up:onoff:<channel>:on`            | Request power-on for channel 1–4  | `up:onoff:<channel>:on`, possibly with an `event` prefix                                                             |
| `up:onoff:<channel>:off`           | Request power-off for channel 1–4 | `up:onoff:<channel>:off`, possibly with an `event` prefix                                                            |
| `up:onoff:0:on` / `up:onoff:0:off` | Request a master relay change     | A channel-0 report or individual outlet reports, depending on firmware                                               |
| `up:reboot:0`                      | Request restart                   | Look for a new TCP session, boot announcement, and fresh four-channel telemetry; runtime support depends on firmware |

The normal UI applies freshness and protection checks before power-on, and waits for newer relay reports. The protocol console sends raw commands outside those relay checks. A raw command is still blocked while automation owns the target strip.

The strip sends `up:bootinfo:<model>;<mac>;<mac>;<firmware>;connect` on connection. This is an inbound announcement, not a supported runtime query. Tested runtime firmware does not implement `up:bootinfo`, `up:query:ip`, `up:query:ver`, or `up:query:mac` as queries; it may reply with an empty line. Firmware and MAC come from the boot announcement; the strip's IP comes from its TCP connection.

## Setup commands

Join the strip's setup Wi-Fi before opening its setup endpoint. The standard sequence is:

```text
up:ip:<controller_ipv4>             -> up:ip:ip_ok
up:connect:<wifi_ssid>:<password>   -> up:connect:connect_ok
up:reboot:0                        -> connection closes
```

The controller IPv4 must be reachable from the destination network. The app preserves password spaces and rejects separators and line endings that cannot be represented by this protocol. SSIDs and passwords are sent unencrypted.

Custom-port strategies are firmware-dependent:

| Strategy       | Frames                                  | Status                                          |
| -------------- | --------------------------------------- | ----------------------------------------------- |
| Standard       | `up:ip:<ip>`                            | Stock controller port 10086                     |
| Combined colon | `up:ip:<ip>:<port>`                     | Candidate syntax; verify on the target firmware |
| Combined comma | `up:ip:<ip>,<port>`                     | Candidate syntax; verify on the target firmware |
| Separate port  | `up:ip:<ip>`, then `up:port:<port>`     | Requires explicit acknowledgements              |
| Set port       | `up:ip:<ip>`, then `up:set:port:<port>` | Requires explicit acknowledgements              |

**Device setup → Advanced diagnostics** can probe these candidates. Probes may change the device's saved controller address or port. A reply alone does not prove the new port works: verify a runtime connection afterward. Extra controller listeners bind to all interfaces; provisioning stops if a requested listener cannot be created.

## Desktop API

These commands are exposed through Tauri IPC to the main window. They are not HTTP endpoints. Frontend callers use the typed wrappers in [src/api.ts](src/api.ts); Rust handlers are in [src-tauri/src/commands.rs](src-tauri/src/commands.rs).

| Area                | Commands                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipment           | `get_devices`, `get_removed_devices`, `register_device`, `remove_device`, `restore_device`, `reboot_device`                                              |
| Names and notes     | `update_device_alias`, `update_outlet_metadata`                                                                                                          |
| Relay control       | `set_outlet_state`, `all_outlets_on`, `all_outlets_off`, `all_strips_off`                                                                                |
| Readings and events | `refresh_device_telemetry`, `get_telemetry_history`, `get_activity_logs`, `send_raw_command`                                                             |
| Recorded history    | `get_history_devices`, `get_history_chart`, `get_history_page`                                                                                           |
| Data management     | `get_data_stats`, `clear_data`                                                                                                                           |
| Discovery           | `get_network_info`, `scan_network`, `get_system_wifi_info`, `derive_wifi_password`                                                                       |
| Setup               | `provision_device`, `auto_provision`, `connect_system_wifi`, `probe_setup_endpoint`, `send_setup_command`                                                |
| Listener status     | `get_server_status`, `add_server_listener`                                                                                                               |
| Automation          | `get_automation`, `save_automation_plan`, `run_automation_plan`, `stop_automation_plan`, `save_monitor_rule`, `delete_automation`, `stop_all_automation` |

`provision_device` takes a `request` object with camelCase fields: `targetIp`, `targetPort`, `controllerIp`, `controllerPort`, `portStrategy`, `wifiSsid`, and `wifiPassword`. `auto_provision` takes a `request` with `stripSsid`, `stripPassword`, optional `stripBssid`, and a nested `setup` object with the same manual-setup fields. Requests contain credentials and must not be logged.

Setup operations run sequentially under a backend lock. Automatic setup attempts to restore the computer's prior NetworkManager profile after both success and failure. The UI confirms setup only after a new runtime connection with fresh telemetry and matching identity.
