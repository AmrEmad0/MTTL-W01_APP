# MTTL / TONLY Smart Power Strip Controller Protocol Guide

**Status:** Reverse-engineered interoperability specification  
**Primary tested device:** LG / TONLY MTTL-W01 family (`lgutap`)  
**Primary tested firmware:** `0.1.54-1.0.66`  
**Purpose:** Language-neutral guide for building controllers, servers, desktop apps, mobile apps, gateways, SaaS backends, Home Assistant integrations, automation engines, diagnostics tools, and test utilities for stock-firmware MTTL/TONLY smart power strips.

---

## 1. Scope and evidence levels

This document separates protocol facts into three levels:

- **CONFIRMED — source + hardware:** recovered from controller/app source and verified against a real strip.
- **CONFIRMED — source:** recovered from source code but not yet exercised on the real strip used during testing.
- **OBSERVED / UNKNOWN:** seen in raw telemetry or app metadata, but its physical meaning is not yet established.

Do not silently convert an unknown field into voltage/current/etc. Preserve unknown values in your implementation so they can be studied later.

---

## 2. High-level architecture

The strip does **not** need an inbound connection from the Internet. After provisioning, it acts as a TCP client and connects outward to the configured controller IPv4 address.

```text
                        Setup mode
                 Wi-Fi AP: TONLY_TAP_...
                         or ONLY_TAP_...
                               |
                               | TCP 30300
                               v
                        Provisioning app
                               |
                  up:ip:<controller_ipv4>
                  up:connect:<ssid>:<pass>
                  up:reboot:0
                               |
                               v
                         Home / site Wi-Fi
                               |
                               | outbound TCP
                               | destination port 10086
                               v
                    +-----------------------+
                    |   Controller / VPS    |
                    |                       |
                    | TCP :10086            |
                    | session registry      |
                    | telemetry parser      |
                    | relay commands        |
                    | rules / automations   |
                    +-----------------------+
                               |
                               +--> REST / WebSocket / MQTT / UI
                               +--> database / metrics / alerts
                               +--> third-party integrations
```

### Important design consequence

`up:ip:` configures the destination **IPv4 address**. The runtime port appears to be fixed by stock firmware at **TCP 10086**.

Therefore a public controller should expose TCP port `10086` directly or via transparent TCP forwarding.

---

# Part A — Provisioning Protocol

## 3. Setup Wi-Fi network

### Supported setup SSID prefixes

Confirmed from FG-Hub compatibility logic:

```text
TONLY_TAP_
ONLY_TAP_
```

### Setup AP password derivation

For an SSID such as:

```text
TONLY_TAP_ABC123
```

the password is:

```text
LGU_ABC123
```

General rule:

```text
password = "LGU_" + suffix_after_last_underscore(ssid)
```

The same derivation is used for `ONLY_TAP_*`.

### Credential restriction

The setup dialect uses `:` as a field separator. Implementations should reject target Wi-Fi SSIDs/passwords containing `:`. CR and LF should also be rejected.

---

## 4. Setup service endpoint

### Confirmed endpoint for tested device

```text
TCP host: 192.168.1.1
TCP port: 30300
Encoding: UTF-8
Line ending: \r\n
```

FG-Hub discovers the active private IPv4 gateway and prefers `192.168.1.1`, falling back to a private gateway if available.

An alternative `192.168.4.1` address exists in WattQ binaries and may apply to other hardware/firmware variants, but it has not been verified on the tested MTTL-W01.

### Reference timeouts

FG-Hub uses approximately:

```text
connect timeout: 7000 ms
read timeout:    3500 ms
```

These are implementation defaults, not protocol requirements.

---

## 5. Provisioning command sequence

Commands are UTF-8 text terminated by CRLF.

### 5.1 Configure runtime controller IPv4

Controller/app -> strip:

```text
up:ip:<CONTROLLER_IPV4>\r\n
```

Example:

```text
up:ip:192.168.1.21\r\n
```

Observed reply:

```text
up:ip:ip_ok
```

After provisioning, the tested strip connected to the configured IPv4 on TCP port `10086`.

### 5.2 Configure target Wi-Fi

Controller/app -> strip:

```text
up:connect:<SSID>:<PASSWORD>\r\n
```

Example:

```text
up:connect:OfficeWiFi:secret123\r\n
```

Observed reply:

```text
up:connect:connect_ok
```

### 5.3 Reboot / leave setup mode

Controller/app -> strip:

```text
up:reboot:0\r\n
```

FG-Hub does not require a reply to this command.

### Recommended provisioning sequence

```text
1. Join TONLY_TAP_* / ONLY_TAP_* AP
2. Connect TCP to setup gateway:30300
3. Send up:ip:<controller IPv4>
4. Require a response line
5. Send up:connect:<SSID>:<PASSWORD>
6. Require a response line
7. Send up:reboot:0
8. Close setup socket
9. Wait for strip to join target Wi-Fi
10. Wait for outbound TCP connection on controller:10086
```

---

# Part B — Runtime Controller Protocol

## 6. Transport

### Runtime socket

```text
Transport: TCP
Controller listen port: 10086
Direction: strip initiates connection to controller
Encoding: UTF-8 text
Command terminator: \r\n
```

Recommended accepted-socket options:

```text
SO_KEEPALIVE = true
TCP_NODELAY  = true
```

### Security warning

The stock protocol observed so far is plaintext TCP and contains no verified cryptographic authentication or TLS.

Treat TCP `10086` as an untrusted device-facing interface:

- never expose your administrative REST API on the same unauthenticated interface;
- validate every frame strictly;
- rate-limit connections and malformed frames;
- use MAC allowlists/ownership mapping as an application control, while remembering a MAC is not cryptographic proof;
- isolate the raw device listener from privileged application services;
- secure web/mobile APIs separately with normal authentication and TLS.

---

## 7. Framing

### Logical framing

Protocol messages are text lines.

Recommended decoder:

```text
TCP bytes
  -> accumulate into bounded buffer
  -> split on LF (0x0A)
  -> remove optional preceding CR (0x0D)
  -> trim NUL bytes and surrounding protocol whitespace
  -> parse message
```

### 258-byte hardware behavior

The tested firmware frequently transmits a **258-byte physical buffer** containing the real CRLF-terminated message followed by NUL (`0x00`) padding.

Example conceptually:

```text
up:onoff:1:on\r\n\0\0\0\0\0...
```

**Do not define 258 bytes as the wire protocol frame size.**

The controller reference code uses line-oriented reads and trimming, so the actual protocol should be treated as textual CRLF messages with possible NUL padding from this firmware implementation.

### Safety limits

FG-Hub rejects individual/pending frames above approximately:

```text
65,536 characters
```

A production implementation should keep a similar hard upper bound.

---

# Part C — Session Lifecycle

## 8. Device connection state machine

```text
DISCONNECTED
    |
    | TCP accepted on :10086
    v
AWAITING_BOOT
    |
    | valid up:bootinfo...
    v
IDENTIFIED
    |
    | normalize MAC, replace prior session for same MAC
    | immediately send up:getinfo:all
    v
ONLINE
    |
    +---- receive telemetry
    +---- receive relay state
    +---- send relay commands
    +---- periodic telemetry polling
    |
    | EOF / socket error / replacement connection
    v
DISCONNECTED
```

### Duplicate MAC sessions

A controller should maintain **one active session per normalized MAC**.

When a second connection boots with the same MAC:

```text
new connection wins
old connection is closed
session map is replaced atomically
```

This is important for Wi-Fi reconnects, strip reboots, router changes, and stale TCP sessions.

---

# Part D — Boot / Identification

## 9. Boot message

Strip -> controller:

```text
up:bootinfo:<MODEL>;<MAC1>;<MAC2>;<FIRMWARE>;connect\r\n
```

Exact accepted grammar recovered from the parser:

```regex
^up:bootinfo:([^;\r\n]{1,32});([0-9A-Fa-f]{12});([0-9A-Fa-f]{12});([^;\r\n]{1,64});connect$
```

The parser requires `MAC1` and `MAC2` to be equal case-insensitively.

### Tested real message

```text
up:bootinfo:lgutap;D8AA59DC41CD;d8aa59dc41cd;0.1.54-1.0.66;connect
```

Normalized interpretation:

```text
model/family: lgutap
MAC:          D8AA59DC41CD
firmware:     0.1.54-1.0.66
state:        connect
```

### Current supported family

FG-Hub accepts the runtime model name:

```text
lgutap
```

Implementations should retain the model field and avoid assuming every future compatible product uses the same model string.

### After valid boot

Send immediately:

```text
up:getinfo:all\r\n
```

---

# Part E — Telemetry

## 10. Telemetry request

Controller -> strip:

```text
up:getinfo:all\r\n
```

FG-Hub reference behavior:

```text
first poll: about 2 seconds after controller startup
periodic poll: every 10 seconds
```

The session reader also requests telemetry immediately after successful boot.

A 10-second interval is a conservative production default. Applications may issue an extra on-demand poll after a control operation.

---

## 11. Telemetry response format

Strip -> controller:

```text
up:getinfo:1:<RECORD1>:2:<RECORD2>:3:<RECORD3>:4:<RECORD4>\r\n
```

After the `up:getinfo:` prefix the reference parser expects exactly eight colon-separated elements:

```text
channel : record : channel : record : channel : record : channel : record
```

All four channels `1..4` must be present exactly once.

Each record contains exactly **12 semicolon-separated fields**.

### Real captured example

```text
up:getinfo:1:0;on;3;on;on;895;00000003;00000000;00000000;off;00;30:2:0;off;3;on;on;0;00000000;00000000;00000000;off;00;30:3:0;off;3;on;on;0;00000000;00000000;00000000;off;00;30:4:0;off;3;on;on;0;00000000;00000000;00000000;off;00;30
```

---

## 12. Per-outlet telemetry record

Record:

```text
F0;F1;F2;F3;F4;F5;F6;F7;F8;F9;F10;F11
```

### Field table

| Field | Accepted format | Normalized meaning | Physical function & Provenance | Confidence |
|---|---|---|---|---|
| `F0` | decimal integer | `countdown_sec` | Active countdown timer remaining (seconds/minutes; `0` when idle) | Decoded |
| `F1` | `on` / `off` | `relay_state` | Relay contact switch state (`on` = closed / energized, `off` = open / isolated) | Confirmed |
| `F2` | decimal integer | `standby_threshold_w` | Standby power cutoff threshold in Watts (factory default: `3` W per Korean regulation) | Confirmed |
| `F3` | `on` / `off` | `overload_ok` | Overload protection circuit status (`on` = normal / healthy, `off` = tripped >16A) | Decoded & Verified |
| `F4` | `on` / `off` | `overheat_ok` | Thermal / overheat protection status (`on` = normal / healthy, `off` = thermal cutoff) | Decoded & Verified |
| `F5` | decimal integer | `power_w` | Live active power in milliwatts; divide by 1000.0 -> Watts | Confirmed |
| `F6` | exactly 8 hex chars | `energy_kwh` | Total cumulative active energy; hex to Watt-hours, divide by 1000.0 -> kWh | Confirmed |
| `F7` | exactly 8 hex chars | `secondary_energy_kwh` | Secondary / daily energy counter in Watt-hours (Wh); divide by 1000.0 -> kWh | Decoded |
| `F8` | exactly 8 hex chars | `energy_budget_kwh` | Energy quota limit / previous period accumulator in Watt-hours (Wh) | Decoded |
| `F9` | `on` / `off` | `standby_cutoff_enabled` | Standby power auto-cutoff feature flag (`off` = disabled, `on` = active auto-cutoff) | Decoded |
| `F10` | exactly 2 hex chars | `event_code` | Hardware fault / event code (`00` = Normal / OK, `01` = Overload, `02` = Overheat, `04` = Button) | Confirmed |
| `F11` | signed decimal integer | `temperature_c` | Internal PCB / strip temperature in °C | Confirmed |

### Resolution of F3/F4 Active Polarity

In early reverse-engineering (e.g. FG Link app code), `F3` and `F4` were labeled as overload and overheat warning flags, and the parser mistakenly assumed `on` signified an active alarm:

```text
// Incorrect active-high assumption in legacy app:
str4 = (flag3 == on) ? "OVERLOAD" : "OVERHEAT";
```

However, hardware electrical design and verified firmware captures prove the opposite:
- **`on` = Protection circuit intact / Normal / Fail-safe closed.** All healthy tested strips report `F3=on` and `F4=on` continuously during normal operation with `F10=00`.
- **`off` = Tripped.** When an overload condition (> 16 A / 3,520 W) or excessive temperature is reached, the safety comparator opens and the respective flag changes to `off`.

Controllers should normalize `F3` and `F4` as:

```text
overload_ok = (F3 == "on")
overheat_ok = (F4 == "on")
```

Trip alarms should fire only when `overload_ok == False`, `overheat_ok == False`, or `F10 != "00"`.

---

## 13. Telemetry conversion formulas

### Power

```text
power_w = decimal(F5) / 1000.0
```

Examples from real hardware:

```text
44610 -> 44.610 W
47990 -> 47.990 W
895   -> 0.895 W
0     -> 0 W
```

### Energy

```text
energy_kwh = hex_to_integer(F6) / 1000.0
```

Example:

```text
F6 = 00000003
hex -> 3
3 / 1000 = 0.003 kWh
```

Numerically, the raw integer therefore behaves like accumulated Wh.

Do not yet assume whether this counter is lifetime, resettable, retained across reboot, or wraps at a particular point. Store the raw value as well as the normalized value.

### Temperature

```text
temperature_c = signed_decimal(F11)
```

The tested strip repeatedly reported:

```text
30 C
```

for all four outlet records. It is not yet confirmed whether there is truly one temperature sensor per outlet or whether firmware repeats a common internal temperature.

---

## 14. Recommended telemetry model

Language-neutral representation:

```text
OutletTelemetry {
    channel: 1..4,
    relay_on: bool,

    power_w: float,
    energy_kwh: float,
    temperature_c: integer,
    event_code: string,

    protection_flag_a: bool,
    protection_flag_b: bool,

    raw_f0: integer,
    raw_f2: integer,
    raw_f7_hex: string,
    raw_f8_hex: string,
    raw_f9: bool,
    raw_energy_hex: string,

    received_at: timestamp
}
```

Preserving raw fields is strongly recommended for future protocol discoveries.

---

# Part F — Relay Control

## 15. Set outlet state

Controller -> strip:

```text
up:onoff:<OUTLET>:<STATE>\r\n
```

Where:

```text
OUTLET = 1 | 2 | 3 | 4
STATE  = on | off
```

Examples:

```text
up:onoff:1:on\r\n
up:onoff:1:off\r\n
up:onoff:4:on\r\n
```

This command has been verified on real hardware.

---

## 16. Relay state reply / event

The parser accepts both forms:

```text
up:onoff:<OUTLET>:<STATE>
```

and:

```text
up:event:onoff:<OUTLET>:<STATE>
```

Exact grammar:

```regex
^up:(?:event:)?onoff:([1-4]):(on|off)$
```

Real hardware verified the direct echo form:

```text
command: up:onoff:1:on
reply:   up:onoff:1:on
```

and similarly for `off`.

The exact circumstances that produce the `up:event:onoff:` variant are not yet confirmed. A physical-button/local-change event is one plausible use, but should not be assumed until captured.

### Recommended command lifecycle

Treat commands as asynchronous:

```text
1. write up:onoff...
2. mark desired state as pending
3. wait for matching relay reply and/or telemetry confirmation
4. update authoritative state
5. timeout if no confirmation
```

There is no observed request ID in this protocol, so serialize or carefully reconcile multiple simultaneous commands per outlet.

---

# Part G — Polling, Health and Reconnection

## 17. Polling

Reference default:

```text
up:getinfo:all every 10 seconds
```

Recommended production behavior:

- periodic polling: 10 s default;
- optional extra poll after a relay command;
- do not start with sub-second fleet-wide polling;
- apply jitter at large scale to prevent every device being queried simultaneously.

Example fleet polling strategy:

```text
base interval = 10 s
jitter = +/- 1 s per session
```

---

## 18. Online/offline determination

A device is online while its identified TCP session is alive.

Recommended timestamps:

```text
connected_at
last_frame_at
last_telemetry_at
last_relay_event_at
last_command_at
```

Possible health states:

```text
CONNECTING
ONLINE
STALE_TELEMETRY
DISCONNECTED
```

Do not infer offline solely from missing telemetry if the TCP socket is still healthy; mark telemetry separately as stale.

---

## 19. Connection replacement

Use normalized uppercase 12-hex MAC as the session key:

```text
D8AA59DC41CD
```

On a duplicate boot for the same MAC:

```text
close old socket
install new socket atomically
emit DeviceReconnected
```

---

# Part H — Capabilities and Non-Capabilities

## 20. Confirmed device capabilities

The stock runtime protocol currently supports at least:

```text
- device identification / firmware reporting
- four independent relay states
- four independent relay control commands
- live power (W) per outlet
- accumulated energy (kWh) per outlet
- temperature value in each outlet record
- event/fault code
- additional unknown/protection/status fields
```

---

## 21. Voltage and current

### Voltage

No verified live-voltage field is currently exposed by the decoded stock `up:getinfo:all` protocol.

Do not fabricate `220 V`, `230 V`, etc. as measured voltage.

### Current

No verified measured-current field has been identified in the decoded record.

If an application needs an **estimate**, it may calculate:

```text
estimated_current_a = power_w / assumed_voltage_v
```

For example:

```text
47.99 W / 220 V = 0.218 A estimated
```

This is **not** a measured current and must be labeled as an estimate.

---

## 22. Timers, schedules and power limits

No native MTTL runtime command has yet been verified for:

```text
- timer creation
- schedules
- watt threshold programming
- standby cutoff
- scenes
```

FG-Hub implements these in the controller/application layer using telemetry + normal relay commands.

This is the recommended portable design.

### Controller-side examples

#### Auto-off timer

```text
IF outlet becomes ON
THEN create deadline = now + N minutes
WHEN deadline is reached AND outlet is still ON
SEND up:onoff:<outlet>:off
```

FG-Hub UI allows 1-720 minutes. Treat that as an application policy, not a firmware protocol limit.

#### Power-limit cutoff

```text
IF power_w > configured_limit
THEN send up:onoff:<outlet>:off
```

FG-Hub UI uses 100-3500 W, normally in 50-W steps. Again, this is application policy rather than a proven firmware constraint.

#### Charging-complete / standby cutoff

```text
IF outlet is ON
AND power_w < standby_threshold
FOR configured_duration
THEN turn outlet OFF
```

#### Schedule

```text
IF current local/site time matches rule
THEN set outlet ON/OFF
```

#### Scene

```text
scene = [outlet1 state, outlet2 state, outlet3 state, outlet4 state]
apply each desired state through up:onoff commands
```

---

# Part I — Portable Controller API Design

## 23. Core language-neutral interface

A reusable implementation should expose protocol logic separately from UI/network APIs.

```text
Controller.start_listener(port = 10086)
Controller.stop()

Controller.list_devices()
Controller.get_device(mac)
Controller.request_telemetry(mac)
Controller.set_outlet(mac, outlet, on)
Controller.disconnect(mac)
```

### Event interface

```text
DeviceConnected {
    mac,
    model,
    firmware,
    remote_address,
    connected_at
}

DeviceDisconnected {
    mac,
    reason,
    disconnected_at
}

RelayStateChanged {
    mac,
    outlet,
    on,
    received_at
}

TelemetryReceived {
    mac,
    outlets[4],
    received_at
}

UnknownFrame {
    mac?,
    raw,
    received_at
}
```

This abstraction works equally well in Rust, Go, Java, Kotlin, C#, Python, Node.js, Dart, C++, etc.

---

## 24. Suggested internal modules

```text
mttl/
  protocol
    constants
    parser
    encoder
    models

  transport
    listener
    session
    registry

  controller
    commands
    polling
    events

  provisioning
    wifi
    setup_client

  automation
    scheduler
    power_limit
    standby_cutoff
    scenes

  storage
    devices
    telemetry
    events
```

Keep protocol parsing independent from database/UI/framework code.

---

# Part J — Suggested HTTP / WebSocket API

## 25. REST API example

This section is a recommended application API, **not** part of the MTTL firmware protocol.

### Device list

```http
GET /v1/devices
```

Example response:

```json
{
  "devices": [
    {
      "mac": "D8AA59DC41CD",
      "model": "lgutap",
      "firmware": "0.1.54-1.0.66",
      "online": true
    }
  ]
}
```

### Latest state

```http
GET /v1/devices/D8AA59DC41CD/state
```

### Request refresh

```http
POST /v1/devices/D8AA59DC41CD/refresh
```

Internally:

```text
up:getinfo:all
```

### Set outlet

```http
PUT /v1/devices/D8AA59DC41CD/outlets/1
Content-Type: application/json

{"on": true}
```

Internally:

```text
up:onoff:1:on
```

### Telemetry history

```http
GET /v1/devices/D8AA59DC41CD/telemetry?from=...&to=...
```

### Rules

```http
POST /v1/rules
GET  /v1/rules
PUT  /v1/rules/{id}
DELETE /v1/rules/{id}
```

---

## 26. Real-time application events

Recommended WebSocket/SSE event names:

```text
device.connected
device.disconnected
device.telemetry
outlet.state
command.pending
command.confirmed
command.timeout
rule.triggered
```

Example:

```json
{
  "type": "device.telemetry",
  "mac": "D8AA59DC41CD",
  "ts": "2026-10-06T00:31:55.786+03:00",
  "outlets": [
    {
      "channel": 1,
      "on": true,
      "power_w": 0.895,
      "energy_kwh": 0.003,
      "temperature_c": 30,
      "event_code": "00"
    }
  ]
}
```

---

# Part K — Persistence Model

## 27. Recommended device table

```text
devices
-------
mac                 primary key
model
firmware
name
site_id
first_seen_at
last_seen_at
last_connected_at
last_remote_ip
metadata_json
```

## 28. Latest outlet-state table

```text
outlet_state
------------
mac
outlet              1..4
on
power_w
energy_kwh
temperature_c
event_code
protection_flag_a
protection_flag_b
raw_json
updated_at
```

Primary key:

```text
(mac, outlet)
```

## 29. Time-series telemetry

At scale, do not necessarily persist every 10-second sample forever.

Possible policy:

```text
hot:      raw samples 1-7 days
warm:     1-minute aggregates 30-90 days
long:     hourly/daily energy aggregates
```

Keep event transitions separately so relay/fault history is not lost during aggregation.

---

# Part L — Parser Requirements

## 30. Boot parser requirements

Reject if:

```text
- prefix is wrong
- field count does not match
- either MAC is not exactly 12 hex chars
- two MAC copies differ
- model is unsupported by policy
- firmware field exceeds safe limit
```

Normalize MAC to uppercase.

---

## 31. Telemetry parser requirements

Reject the whole telemetry message if:

```text
- prefix != up:getinfo:
- not exactly four channel-record pairs
- channel is outside 1..4
- duplicate channel exists
- record does not contain exactly 12 fields
- numeric/hex/boolean field validation fails
```

Strict parsing is preferable to trying to guess malformed measurements.

---

## 32. Relay parser requirements

Accept only:

```regex
^up:(?:event:)?onoff:([1-4]):(on|off)$
```

Case-insensitive parsing of `on/off` is acceptable; output canonical lowercase or boolean internally.

---

# Part M — Large-Scale Controller Behavior

## 33. Session registry

For each connected strip maintain:

```text
mac -> Session
```

Session should contain at least:

```text
socket
write lock / async write queue
mac
model
firmware
remote address
connected_at
last_frame_at
last_telemetry
latest outlet states
closing flag
```

### Concurrency rule

Writes to one device socket must be serialized.

Never allow two threads/tasks to interleave bytes from two commands.

---

## 34. Backpressure

Do not let a slow/dead strip accumulate an unlimited command queue.

Recommended behavior:

```text
small bounded per-device command queue
command deadline
cancel queue when session is replaced/disconnected
coalesce redundant state commands when possible
```

Example coalescing:

```text
ON, OFF, ON queued rapidly for same outlet
-> keep only latest ON if earlier commands have not been sent
```

---

## 35. Scale notes

A controller for thousands of strips mainly holds idle TCP sockets and periodically exchanges small text records.

The protocol itself is lightweight. The larger engineering concerns are:

```text
- session correctness
- reconnect storms
- polling synchronization
- time-series write volume
- WebSocket/API fanout
- rules execution
- authentication/tenant isolation
- observability
```

For a large fleet, jitter periodic polling and separate device transport from user-facing API workers.

---

# Part N — Recommended Command Semantics

## 36. Idempotency

Relay commands are naturally desired-state commands:

```text
set outlet 1 ON
```

rather than toggle commands.

This is good for retries.

If confirmation is lost, the controller can safely query telemetry and resend desired state if required.

---

## 37. Command confirmation

Recommended status model:

```text
queued
sent
acknowledged
confirmed_by_telemetry
failed
timeout
```

For simple apps, `acknowledged` may be enough. For automation/safety-related workflows, prefer telemetry confirmation.

---

# Part O — Known Compatibility Metadata

## 38. Known identifiers seen in FG-Hub metadata

These strings exist in the compatibility code but were not all physically tested during this reverse-engineering session:

```text
HU04139-17002A
HU04139-17002B
HU04139-17002C
HU04139-17002D
HU04139-17002E
```

MAC OUI-like values:

```text
88:D0:39
2C:E0:32
```

Firmware versions listed:

```text
1.0.66
1.0.68
1.0.106
1.0.110
```

The physically tested unit reported:

```text
0.1.54-1.0.66
```

Do not hard-code a single exact firmware string unless your product intentionally restricts compatibility.

---

# Part P — Unknown / Future Research

## 39. Fields still not decoded

Current unknown telemetry values:

```text
F0
F2
F7
F8
F9
exact active polarity/semantics of F3/F4
```

Do not delete them from your parser or database.

## 40. Features not yet verified at protocol level

```text
- true live voltage
- true live current
- native strip timer storage
- native schedule storage
- native power-threshold configuration
- energy-counter reset command
- native temperature threshold
- firmware update protocol
- event-code dictionary
- physical-button event behavior
```

Implement these only after source evidence or hardware capture confirms them.

---

# Part Q — Minimal Reference Pseudocode

## 41. Runtime server

```text
listen tcp :10086

on_accept(socket):
    enable keepalive
    enable tcp_nodelay

    session = new Session(socket)

    while line = read_protocol_line(socket):
        if line matches bootinfo:
            boot = parse_boot(line)
            validate model/mac
            replace_session(boot.mac, session)
            session.identity = boot
            emit device.connected
            send_line(session, "up:getinfo:all")
            continue

        if session.mac is null:
            ignore/reject frame
            continue

        if line starts "up:getinfo:":
            t = parse_telemetry(line)
            if valid:
                session.latest_telemetry = t
                emit device.telemetry
                continue

        if line matches relay state:
            relay = parse_relay(line)
            update state
            emit outlet.state
            continue

        emit unknown.frame

    remove session if still current for its MAC
    emit device.disconnected
```

## 42. Set relay

```text
set_outlet(mac, outlet, on):
    require outlet in 1..4
    session = active_session(mac)
    state = "on" if on else "off"
    send_line(session, "up:onoff:" + outlet + ":" + state)
```

## 43. Polling

```text
every ~10 seconds with jitter:
    for each active session:
        send_line(session, "up:getinfo:all")
```

---

# Part R — Acceptance Tests

## 44. Parser unit tests

At minimum test:

```text
valid boot
mixed-case duplicated MAC
mismatched duplicated MAC
invalid boot model
valid relay on/off
valid event:onoff form
invalid outlet 0/5
valid 4-channel telemetry
missing telemetry channel
duplicate telemetry channel
bad 8-char hex field
negative temperature
NUL-padded physical packet
fragmented TCP input
multiple protocol lines in one TCP read
oversized frame
```

## 45. Hardware acceptance tests

For each firmware family:

```text
1. provision controller IP
2. provision Wi-Fi
3. reboot
4. confirm outbound :10086 connection
5. parse bootinfo
6. request telemetry
7. verify all 4 channels
8. switch each outlet ON then OFF
9. confirm relay response
10. confirm getinfo state
11. vary a safe load and confirm power_w changes
12. confirm energy counter increments over time
13. reboot strip and verify reconnect/replacement behavior
```

---

# Part S — Protocol Cheat Sheet

```text
SETUP AP PREFIX
    TONLY_TAP_
    ONLY_TAP_

SETUP AP PASSWORD
    LGU_<suffix>

SETUP TCP
    <strip gateway>:30300

SETUP COMMANDS
    up:ip:<controller_ipv4>\r\n
    up:connect:<ssid>:<password>\r\n
    up:reboot:0\r\n

RUNTIME TCP
    strip -> controller:10086

BOOT
    up:bootinfo:lgutap;<mac>;<same_mac>;<firmware>;connect\r\n

REQUEST TELEMETRY
    up:getinfo:all\r\n

TELEMETRY
    up:getinfo:1:<record>:2:<record>:3:<record>:4:<record>\r\n

SET RELAY
    up:onoff:<1-4>:on\r\n
    up:onoff:<1-4>:off\r\n

RELAY STATE
    up:onoff:<1-4>:on|off\r\n
    up:event:onoff:<1-4>:on|off\r\n

POWER
    decimal(F5) / 1000 = watts

ENERGY
    hex(F6) / 1000 = kWh

TEMPERATURE
    signed decimal(F11) = degrees C
```

---

# Part T — Implementation Principles

## 46. Rules for every future implementation

1. **The protocol module must not depend on UI code.**
2. **Keep raw telemetry fields even when their meaning is unknown.**
3. **Do not fabricate voltage/current measurements.**
4. **Use desired-state relay commands, not application-level toggles.**
5. **Treat a device as identified only after valid bootinfo.**
6. **Allow only one active socket per MAC.**
7. **Bound every receive buffer and queue.**
8. **Serialize writes per device.**
9. **Confirm important commands from reply and/or telemetry.**
10. **Keep automations above the transport layer.**
11. **Keep raw TCP :10086 isolated from authenticated public APIs.**
12. **Version the parser so firmware-specific behavior can be added later.**

---

# Part U — Recommended Next Specification Work

Future revisions of this document should add:

```text
- event-code catalog
- physical-button event capture
- firmware compatibility matrix
- energy persistence/wrap behavior
- exact F0/F2/F7/F8/F9 semantics
- F3/F4 active polarity and protection meaning
- native firmware-update behavior if needed
- fleet load/scale benchmarks
```

---

## Source basis

This guide was derived from:

- decompiled FG-Hub controller classes including `C1496mg`, `C1366kg`, `G6`, `AbstractC1691pg`, `AbstractC1052fp`, `RunnableC1584o1`, `C1950tg`, and `AbstractC0720ag`;
- decompiled Korean Power provisioning code;
- WattQ binary strings used only where explicitly marked as supporting/experimental evidence;
- direct tests against a physical MTTL-W01 stock-firmware strip, including boot, `up:getinfo:all`, relay ON/OFF, telemetry, NUL padding, power and energy behavior.

**Document rule:** source or hardware confirmation must precede promoting any unknown field or command into the confirmed protocol section.
