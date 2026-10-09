import { t, displayName, localize } from "../i18n";
import { useEffect, useState } from "react";
import { Terminal, Send, Trash2, AlertCircle } from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import type { RawLogEvent, DeviceInfo } from "../types";
interface CommandPreset {
  cmd: string;
  label: string;
  category: "telemetry" | "master" | "outlets" | "system";
  description: string;
  expected: string;
}

const PRESET_COMMANDS: CommandPreset[] = [
  // Telemetry & Diagnostics
  {
    cmd: "up:getinfo:all",
    label: "Full Telemetry",
    category: "telemetry",
    description:
      "Queries live telemetry for all 4 outlets (power, energy, relay states, temperatures, flags).",
    expected: "up:getinfo:1:<record>:2:<record>:3:<record>:4:<record>",
  },
  {
    cmd: "up:power_report:1:vol",
    label: "AC Line Voltage",
    category: "telemetry",
    description:
      "Queries live AC line voltage from strip hardware in millivolts.",
    expected: "up:power_report:1:<millivolts> (e.g. 224500 = 224.5 V)",
  },
  {
    cmd: "up:query:wifirssi",
    label: "Wi-Fi Signal (RSSI)",
    category: "telemetry",
    description: "Queries strip Wi-Fi connection signal strength in dBm.",
    expected: "up:query:<dBm> (e.g. -52)",
  },

  // Master Switch Control (Channel 0)
  {
    cmd: "up:onoff:0:on",
    label: "Master: All Outlets ON",
    category: "master",
    description:
      "Sends master power command to switch all 4 outlets ON simultaneously.",
    expected: "up:onoff:0:on (or individual relay confirmations)",
  },
  {
    cmd: "up:onoff:0:off",
    label: "Master: All Outlets OFF",
    category: "master",
    description:
      "Sends master power command to switch all 4 outlets OFF simultaneously.",
    expected: "up:onoff:0:off (or individual relay confirmations)",
  },

  // Individual Outlets (1–4)
  {
    cmd: "up:onoff:1:on",
    label: "Outlet 1: ON",
    category: "outlets",
    description: "Energizes Outlet 1 relay.",
    expected: "up:onoff:1:on",
  },
  {
    cmd: "up:onoff:1:off",
    label: "Outlet 1: OFF",
    category: "outlets",
    description: "De-energizes Outlet 1 relay.",
    expected: "up:onoff:1:off",
  },
  {
    cmd: "up:onoff:2:on",
    label: "Outlet 2: ON",
    category: "outlets",
    description: "Energizes Outlet 2 relay.",
    expected: "up:onoff:2:on",
  },
  {
    cmd: "up:onoff:2:off",
    label: "Outlet 2: OFF",
    category: "outlets",
    description: "De-energizes Outlet 2 relay.",
    expected: "up:onoff:2:off",
  },
  {
    cmd: "up:onoff:3:on",
    label: "Outlet 3: ON",
    category: "outlets",
    description: "Energizes Outlet 3 relay.",
    expected: "up:onoff:3:on",
  },
  {
    cmd: "up:onoff:3:off",
    label: "Outlet 3: OFF",
    category: "outlets",
    description: "De-energizes Outlet 3 relay.",
    expected: "up:onoff:3:off",
  },
  {
    cmd: "up:onoff:4:on",
    label: "Outlet 4: ON",
    category: "outlets",
    description: "Energizes Outlet 4 relay.",
    expected: "up:onoff:4:on",
  },
  {
    cmd: "up:onoff:4:off",
    label: "Outlet 4: OFF",
    category: "outlets",
    description: "De-energizes Outlet 4 relay.",
    expected: "up:onoff:4:off",
  },

  // System & Maintenance
  {
    cmd: "up:reboot:0",
    label: "Reboot Strip MCU",
    category: "system",
    description:
      "Restarts strip microcontroller and Wi-Fi stack. The strip reconnects and sends its bootinfo handshake.",
    expected: "Strip drops connection, restarts, and sends up:bootinfo:...",
  },
  {
    cmd: "up:bootinfo",
    label: "Boot Info (Device Announcement)",
    category: "system",
    description:
      "The strip transmits up:bootinfo automatically upon connection/reboot. Sending it manually as a query to the strip is not implemented by stock firmware (yields empty response). Use 'Reboot Strip MCU' to trigger a new boot handshake.",
    expected:
      "Sent by strip upon connect: up:bootinfo:<model>;<mac1>;<mac2>;<fw>;connect",
  },
  {
    cmd: "up:query:ip",
    label: "Query Device IP (Unsupported by MCU)",
    category: "system",
    description:
      "The MCU runtime firmware does not implement up:query:ip (returns empty CRLF). The strip IPv4 address is obtained directly from its active TCP socket.",
    expected: "Empty response (command not implemented in stock MCU firmware)",
  },
  {
    cmd: "up:query:ver",
    label: "Query Firmware Version (Unsupported by MCU)",
    category: "system",
    description:
      "Firmware version is announced in the initial boot frame. Stock MCU runtime returns empty CRLF.",
    expected: "Empty response (command not implemented in stock MCU firmware)",
  },
  {
    cmd: "up:query:mac",
    label: "Query Hardware MAC (Unsupported by MCU)",
    category: "system",
    description:
      "Hardware MAC is announced in the initial boot frame. Stock MCU runtime returns empty CRLF.",
    expected: "Empty response (command not implemented in stock MCU firmware)",
  },
];

const CATEGORIES: { id: "all" | CommandPreset["category"]; label: string }[] = [
  { id: "all", label: "All commands" },
  { id: "telemetry", label: "Telemetry & Diagnostics" },
  { id: "master", label: "Master Switch (Ch 0)" },
  { id: "outlets", label: "Outlets (1–4)" },
  { id: "system", label: "System & Maintenance" },
];

export function RawConsoleView({
  logs,
  devices,
  selectedMac,
  onClearLogs,
}: {
  logs: RawLogEvent[];
  devices: DeviceInfo[];
  selectedMac: string;
  onClearLogs: () => void;
}) {
  const [command, setCommand] = useState("up:getinfo:all");
  const [target, setTarget] = useState(selectedMac);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    "all" | CommandPreset["category"]
  >("all");
  const [selectedPreset, setSelectedPreset] = useState<CommandPreset | null>(
    PRESET_COMMANDS[0],
  );

  useEffect(() => setTarget(selectedMac), [selectedMac]);
  const targetDevice = devices.find((d) => d.mac === target);

  async function send(cmdToSend?: string) {
    const rawCmd = (cmdToSend ?? command).trim();
    if (sending || !isTauri() || !targetDevice?.online || !rawCmd) return;
    if (/[\r\n\0]/.test(rawCmd)) {
      setError("Enter one protocol frame without newline or NUL characters.");
      return;
    }
    setSending(true);
    setError("");
    setMessage("");
    try {
      await api.sendRawCommand(target, rawCmd);
      setMessage(
        `Frame '${rawCmd}' queued. Inspect received frames below to verify the device response.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const visible = filter ? logs.filter((log) => log.mac === target) : logs;
  const filteredPresets =
    activeCategory === "all"
      ? PRESET_COMMANDS
      : PRESET_COMMANDS.filter((p) => p.category === activeCategory);
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEVICE DIAGNOSTICS</div>
          <h2>Protocol console</h2>
          <p>Inspect transmitted and received frames from physical strips.</p>
        </div>
        <Terminal size={25} className="muted" />
      </div>
      <section className="panel view-panel">
        <div className="section-heading">
          <div>
            <h3>Command sender</h3>
            <span>Frames go directly to the selected connected device.</span>
          </div>
          <button
            className="btn btn-glass"
            disabled={!logs.length}
            onClick={onClearLogs}
          >
            <Trash2 size={14} />
            Clear display
          </button>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        {message && (
          <div className="notice info" role="status">
            {message}
          </div>
        )}
        <form
          className="command-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="field-label">
            {t("Target strip")}
            <select
              className="input-field"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setMessage("");
              }}
              disabled={sending || !isTauri()}
            >
              <option value="">{t("Select a connected strip")}</option>
              {devices.map((device) => (
                <option
                  data-i18n="off"
                  key={device.mac}
                  value={device.mac}
                  disabled={!device.online}
                >
                  {displayName(device.alias)} · {device.mac}
                  {!device.online && t(" · Offline")}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label command-input">
            {t("Protocol frame")}
            <input
              dir="ltr"
              className="input-field"
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                setMessage("");
              }}
              disabled={sending || !isTauri()}
              spellCheck={false}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={
              sending || !isTauri() || !targetDevice?.online || !command.trim()
            }
          >
            <Send size={15} />
            {sending ? t("Sending…") : t("Send frame")}
          </button>
        </form>
        <div className="command-presets">
          <div className="presets-header">
            <span className="presets-title">
              <Terminal size={16} />
              {t("Command presets & reference")}
            </span>
            <div className="presets-categories">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  className={`preset-category-pill ${activeCategory === cat.id ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {t(cat.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="presets-grid">
            {filteredPresets.map((preset) => (
              <button
                type="button"
                className={`preset-card-btn ${command === preset.cmd ? "active" : ""}`}
                key={preset.cmd}
                onClick={() => {
                  setCommand(preset.cmd);
                  setSelectedPreset(preset);
                  setMessage("");
                }}
              >
                <div className="preset-card-top">
                  <span className="preset-card-cmd">{preset.cmd}</span>
                  <span
                    className="tag-badge ok"
                    style={{ fontSize: "0.6875rem", padding: "1px 6px" }}
                  >
                    {t(preset.category)}
                  </span>
                </div>
                <strong className="preset-card-label">{t(preset.label)}</strong>
                <span className="preset-card-desc">
                  {t(preset.description)}
                </span>
              </button>
            ))}
          </div>
          {selectedPreset && (
            <div className="preset-detail-hint">
              <div>
                <strong>{t("Selected:")} </strong>
                <code>{selectedPreset.cmd}</code> ·{" "}
                {t(selectedPreset.description)}
                <div style={{ marginTop: 4 }}>
                  <span>{t("Expected response:")} </span>
                  <code>{t(selectedPreset.expected)}</code>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-glass btn-small"
                disabled={sending || !isTauri() || !targetDevice?.online}
                onClick={() => {
                  setCommand(selectedPreset.cmd);
                  void send(selectedPreset.cmd);
                }}
              >
                <Send size={13} />
                {t("Send now")}
              </button>
            </div>
          )}
        </div>
        <div className="terminal-toolbar">
          <span>
            {t("LIVE TRAFFIC")}{" "}
            <span className="small-muted">
              {t(`/ ${visible.length} frames · newest first`)}
            </span>
          </span>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label
              className="checkbox-label"
              title={t(
                "Display raw unprocessed bytes/hex dump directly from the TCP socket",
              )}
            >
              <input
                dir="auto"
                type="checkbox"
                checked={rawMode}
                onChange={(e) => setRawMode(e.target.checked)}
              />
              {t("Raw wire data (HEX / unprocessed)")}
            </label>
            <label className="checkbox-label">
              <input
                dir="auto"
                type="checkbox"
                checked={filter}
                onChange={(e) => setFilter(e.target.checked)}
              />
              {t("Selected strip only")}
            </label>
          </div>
        </div>
        <div
          className="terminal-window"
          role="log"
          aria-label="Protocol traffic"
        >
          {visible.length ? (
            visible.map((log, index) => {
              const isEmptyPayload = log.content.startsWith("<empty payload");
              const displayText = rawMode
                ? log.raw_hex || log.content
                : log.content;

              return (
                <div key={index} className="terminal-line">
                  <time>{log.timestamp}</time>
                  <span
                    className={`terminal-direction ${log.direction.toLowerCase()}`}
                  >
                    {t(log.direction)}
                  </span>
                  <span className="terminal-mac">{log.mac}</span>
                  {rawMode && log.byte_len !== undefined && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "#8d9cb0",
                        fontFamily: "var(--font-mono, monospace)",
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
                      {log.byte_len} {t("B")}
                    </span>
                  )}
                  <code>
                    <bdi
                      data-i18n="off"
                      dir="ltr"
                      style={
                        isEmptyPayload && !rawMode
                          ? {
                              opacity: 0.65,
                              fontStyle: "italic",
                              color: "#f87171",
                            }
                          : undefined
                      }
                    >
                      {displayText}
                    </bdi>
                  </code>
                </div>
              );
            })
          ) : (
            <div className="terminal-empty">
              {!isTauri()
                ? t("Protocol traffic is available in the desktop application.")
                : filter
                  ? t("No frames for the selected strip.")
                  : t(
                      "Waiting for device traffic. Incoming frames will appear here.",
                    )}
            </div>
          )}
        </div>
      </section>
    </>,
  );
}
