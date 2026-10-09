import { displayName, localize, localeTag } from "../i18n";
import { useState } from "react";
import {
  Power,
  PowerOff,
  RefreshCw,
  Edit2,
  Check,
  X,
  Cable,
  ArrowRight,
  Radio,
  Wifi,
  Loader2,
  ShieldAlert,
  Trash2,
  RotateCw,
  Plus,
} from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import type { DeviceInfo, RemovedDevice } from "../types";
import {
  outletFault,
  deviceFresh,
  deviceStatus,
  relativeTime,
  telemetryFresh,
} from "../status";
import { OutletItem } from "./OutletItem";

interface DashboardViewProps {
  devices: DeviceInfo[];
  onHistory?: (mac: string, channel?: number) => void;
  onClearRemoved?: () => void;
  removedDevices: RemovedDevice[];
  operationError: string;
  onRemove: (mac: string) => Promise<boolean>;
  onRestore: (mac: string) => Promise<boolean>;
  onReboot: (mac: string) => Promise<boolean>;
  selectedMac: string;
  loading: boolean;
  native: boolean;
  controlsAvailable: boolean;
  pending: Record<string, string>;
  onNavigate: (tab: string) => void;
  onSelectMac: (mac: string) => void;
  onToggleOutlet: (mac: string, channel: number, on: boolean) => void;
  onUpdateOutletName: (
    mac: string,
    channel: number,
    name: string,
    icon: string,
  ) => Promise<boolean>;
  onUpdateStripAlias: (
    mac: string,
    alias: string,
    notes: string,
  ) => Promise<boolean>;
  onAllOn: (mac: string) => void;
  onAllOff: (mac: string) => void;
  onRefreshTelemetry: (mac: string) => void;
}
function StateBadge({ device }: { device: DeviceInfo }) {
  const status = deviceStatus(device);
  return localize(
    <span
      className={`tag-badge ${status === "Online" ? "ok" : status === "Offline" ? "neutral" : status === "Protection trip" ? "trip" : "warn"}`}
    >
      <span className="status-dot" />
      {status}
    </span>,
  );
}
function WifiBadge({ rssi }: { rssi?: number | null }) {
  if (rssi == null) return null;
  const quality =
    rssi >= -60
      ? "Excellent"
      : rssi >= -70
        ? "Good"
        : rssi >= -80
          ? "Fair"
          : "Weak";
  const badgeClass = rssi >= -70 ? "ok" : rssi >= -80 ? "warn" : "trip";
  return localize(
    <span
      className={`tag-badge ${badgeClass}`}
      title={`Wi-Fi: ${rssi} dBm (${quality})`}
    >
      <Wifi
        size={13}
        style={{
          display: "inline",
          verticalAlign: "middle",
          marginInlineEnd: 4,
        }}
      />
      {rssi} dBm
    </span>,
  );
}
function DeviceDetails({
  device,
  busy,
  onSave,
}: {
  device: DeviceInfo;
  busy: boolean;
  onSave: DashboardViewProps["onUpdateStripAlias"];
}) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(device.alias);
  const [notes, setNotes] = useState(device.notes);
  async function save() {
    if (alias.trim() && (await onSave(device.mac, alias.trim(), notes.trim())))
      setEditing(false);
  }
  return localize(
    <>
      <div className="strip-title-row">
        <div className="equipment-icon">
          <Cable size={24} />
        </div>
        <div>
          <div className="eyebrow">SELECTED POWER STRIP</div>
          <h3>
            <bdi data-i18n="off" dir="auto">
              {displayName(device.alias)}
            </bdi>
          </h3>
        </div>
        <StateBadge device={device} />
        {device.online && device.rssi_dbm != null && (
          <WifiBadge rssi={device.rssi_dbm} />
        )}
        <button
          className="btn btn-glass"
          aria-label="Rename strip"
          disabled={busy}
          onClick={() => {
            setAlias(device.alias);
            setNotes(device.notes);
            setEditing(!editing);
          }}
        >
          <Edit2 size={16} />
          Rename strip
        </button>
      </div>
      {editing && (
        <form
          className="device-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Strip name
            <input
              dir="auto"
              className="input-field"
              maxLength={80}
              value={alias}
              disabled={busy}
              onChange={(e) => setAlias(e.target.value)}
              required
            />
          </label>
          <label>
            Notes
            <input
              dir="auto"
              className="input-field"
              maxLength={500}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="action-row">
            <button
              className="btn btn-primary"
              disabled={busy || !alias.trim()}
            >
              <Check size={14} />
              Save
            </button>
            <button
              className="btn btn-glass"
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </form>
      )}
      <dl className="strip-metadata">
        <div>
          <dt>MAC address</dt>
          <dd>{device.mac}</dd>
        </div>
        <div>
          <dt>Device endpoint</dt>
          <dd>
            {device.ip}:{device.port}
          </dd>
        </div>
        <div>
          <dt>Model / firmware</dt>
          <dd>
            {device.model || "—"} / {device.firmware || "—"}
          </dd>
        </div>
        <div>
          <dt>Wi-Fi signal</dt>
          <dd>{device.rssi_dbm != null ? `${device.rssi_dbm} dBm` : "—"}</dd>
        </div>
        <div>
          <dt>Last telemetry</dt>
          <dd>
            {relativeTime(
              Math.max(0, ...device.outlets.map((o) => o.telemetry_at)),
            )}
          </dd>
        </div>
      </dl>
      {device.notes && !editing && (
        <p className="device-notes">{device.notes}</p>
      )}
    </>,
  );
}
export function DashboardView(props: DashboardViewProps) {
  const [dialog, setDialog] = useState<{
    kind: "remove" | "reboot";
    device: DeviceInfo;
  } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogAttempted, setDialogAttempted] = useState(false);
  async function confirmAction() {
    if (!dialog) return;
    setDialogAttempted(true);
    setDialogBusy(true);
    const success = await (dialog.kind === "remove"
      ? props.onRemove(dialog.device.mac)
      : props.onReboot(dialog.device.mac));
    setDialogBusy(false);
    if (success) setDialog(null);
  }
  const {
    devices,
    selectedMac,
    onSelectMac,
    onToggleOutlet,
    onUpdateOutletName,
    onUpdateStripAlias,
    onAllOn,
    onAllOff,
    onRefreshTelemetry,
    loading,
    native,
    controlsAvailable,
    pending,
    onNavigate,
  } = props;
  const visibleRemoved = props.removedDevices.filter(
    (device) => !device.hidden,
  );
  const current = devices.find((d) => d.mac === selectedMac) || devices[0];
  const freshDevices = devices.filter((d) => deviceFresh(d));
  const connected = devices.filter((d) => d.online);
  const power = freshDevices.reduce((sum, d) => sum + d.total_power_w, 0);
  const reportedOutlets = freshDevices.flatMap((d) => d.outlets);
  const trips = reportedOutlets.filter((o) => outletFault(o)).length;
  const powerComplete =
    controlsAvailable &&
    connected.length > 0 &&
    freshDevices.length === connected.length;
  const globalBusy = !!pending.global;
  const busy = !!current && (!!pending[current.mac] || globalBusy);
  const fresh = !!current && deviceFresh(current);
  const hasTelemetry =
    !!current && current.outlets.every((o) => o.telemetry_at > 0);
  const canControl = controlsAvailable && !!current?.online && !busy;
  const canEnable =
    canControl && fresh && current.outlets.every((o) => !outletFault(o));
  const load = current ? Math.max(0, (current.total_power_w / 3520) * 100) : 0;
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">POWER DISTRIBUTION</div>
          <h2>Power overview</h2>
          <p>Monitor connected equipment and manage each outlet.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => onNavigate("scanner")}
        >
          <Plus size={18} />
          Add strips
        </button>
      </div>
      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Connected strips</span>
          <div className="summary-value">
            {native && !loading
              ? connected.length.toString().padStart(2, "0")
              : "—"}
            <span>/ {devices.length.toString().padStart(2, "0")}</span>
          </div>
          <span className="summary-note">
            {devices.length
              ? `${devices.length - connected.length} offline · ${devices.length} registered`
              : "Waiting for physical devices"}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Total live power</span>
          <div className="summary-value">
            {freshDevices.length ? power.toFixed(1) : "—"}
            <span>W</span>
          </div>
          <span className="summary-note">
            {powerComplete
              ? "Across all connected strips"
              : freshDevices.length
                ? `Partial data · ${freshDevices.length} of ${connected.length} connected strips`
                : "No current telemetry"}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Energized outlets</span>
          <div className="summary-value">
            {reportedOutlets.length
              ? reportedOutlets
                  .filter((o) => o.on)
                  .length.toString()
                  .padStart(2, "0")
              : "—"}
            <span>
              /{" "}
              {reportedOutlets.length
                ? reportedOutlets.length.toString().padStart(2, "0")
                : "—"}
            </span>
          </div>
          <span className="summary-note">
            {reportedOutlets.length
              ? "From strips with current telemetry"
              : "Relay state not yet received"}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Protection status</span>
          <div
            className={`summary-value summary-status ${trips ? "danger-text" : ""}`}
          >
            {trips
              ? `${trips} trip${trips === 1 ? "" : "s"}`
              : powerComplete
                ? "Normal"
                : "Unverified"}
          </div>
          <span className="summary-note">
            {trips
              ? "Review affected outlets below"
              : powerComplete
                ? "Overload and thermal checks clear"
                : "Current telemetry required"}
          </span>
        </div>
      </div>
      {loading ? (
        <section className="panel empty-state">
          <Loader2 size={30} className="spin" />
          <h3>Reading controller status</h3>
          <p>Loading registered strips and their latest reports.</p>
        </section>
      ) : !current ? (
        <section className="panel empty-state">
          <div className="empty-icon">
            <Cable size={36} />
          </div>
          <span className="eyebrow">NO DEVICE DATA</span>
          <h3>
            {native
              ? "Waiting for a power strip"
              : "Connect from the desktop application"}
          </h3>
          <p>
            {native
              ? "Set up a physical MTTL-W01 strip with this computer’s controller address. It will appear here when it connects."
              : "Live measurements and outlet controls appear here after a physical MTTL-W01 strip connects to the desktop controller."}
          </p>
          <div className="action-row">
            <button
              className="btn btn-primary"
              onClick={() => onNavigate("provision")}
            >
              <Wifi size={16} />
              Device setup
              <ArrowRight size={15} />
            </button>
            <button
              className="btn btn-glass"
              onClick={() => onNavigate("scanner")}
            >
              <Radio size={16} />
              Network discovery
            </button>
          </div>
          <div className="empty-steps">
            <div>
              <span>01</span>
              <strong>Power on the strip</strong>
              <p>Enable its Wi-Fi setup mode.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Configure the connection</strong>
              <p>Set the Wi-Fi network and controller IP.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Verify live status</strong>
              <p>Review telemetry before switching loads.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h3>
              Registered equipment <span>{devices.length}</span>
            </h3>
            <span>Choose a strip to inspect</span>
          </div>
          <div className="strip-selector-bar">
            <div className="strip-pill-list">
              {devices.map((device) => (
                <button
                  className={`strip-pill ${device.mac === current.mac ? "active" : ""}`}
                  key={device.mac}
                  aria-pressed={device.mac === current.mac}
                  onClick={() => onSelectMac(device.mac)}
                >
                  <span
                    className={`status-dot ${deviceStatus(device) === "Online" ? "ok" : device.online ? "warn" : ""}`}
                  />
                  <span>
                    <bdi data-i18n="off" dir="auto">
                      {displayName(device.alias)}
                    </bdi>
                  </span>
                  <span className="strip-pill-watts">
                    {deviceFresh(device)
                      ? `${device.total_power_w.toFixed(1)} W`
                      : device.online
                        ? "Awaiting data"
                        : "Offline"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <section className="panel strip-header-card">
            <div className="device-lifecycle-actions">
              <button
                className="btn btn-glass"
                onClick={() => props.onHistory?.(current.mac)}
              >
                Usage & history
              </button>
              <button
                className="btn btn-glass"
                disabled={!canControl}
                onClick={() => {
                  setDialogAttempted(false);
                  setDialog({ kind: "reboot", device: current });
                }}
              >
                <RotateCw size={17} />
                Reboot strip
              </button>
              <button
                className="btn btn-danger"
                disabled={!native || busy}
                onClick={() => {
                  setDialogAttempted(false);
                  setDialog({ kind: "remove", device: current });
                }}
              >
                <Trash2 size={17} />
                Remove strip
              </button>
            </div>
            <DeviceDetails
              key={current.mac}
              device={current}
              busy={busy || !native}
              onSave={onUpdateStripAlias}
            />
            <div className="strip-metrics-group">
              <div className="metric-gauge">
                <span className="metric-gauge-label">
                  {fresh ? "Active power" : "Last reported power"}
                </span>
                <span className={`metric-gauge-val ${fresh ? "" : "muted"}`}>
                  {hasTelemetry ? current.total_power_w.toFixed(1) : "—"}
                  <small>W</small>
                </span>
              </div>
              <div className="metric-gauge">
                <span className="metric-gauge-label">AC line voltage</span>
                <span className={`metric-gauge-val ${fresh ? "" : "muted"}`}>
                  {current.voltage_v != null
                    ? current.voltage_v.toFixed(1)
                    : "—"}
                  <small>V</small>
                </span>
                <span className="small-muted">
                  {current.voltage_v != null
                    ? "Live measurement"
                    : "Awaiting report"}
                </span>
              </div>
              <div className="metric-gauge">
                <span className="metric-gauge-label">
                  {current.voltage_v != null
                    ? "Calculated current"
                    : "Estimated current"}
                </span>
                <span className={`metric-gauge-val ${fresh ? "" : "muted"}`}>
                  {hasTelemetry ? current.total_current_a.toFixed(2) : "—"}
                  <small>A</small>
                </span>
                <span className="small-muted">
                  {current.voltage_v != null
                    ? `Based on ${current.voltage_v.toFixed(1)} V`
                    : "Calculated at 220 V"}
                </span>
              </div>
              <div className="load-bar-wrapper">
                <div className="load-bar-label">
                  <span>Rated capacity</span>
                  <strong>{hasTelemetry ? `${load.toFixed(1)}%` : "—"}</strong>
                </div>
                <div className="load-bar-track">
                  <div
                    className={`load-bar-fill ${load >= 80 ? "warn" : ""}`}
                    style={{
                      width: hasTelemetry ? `${Math.min(100, load)}%` : "0%",
                    }}
                  />
                </div>
                <span className="small-muted">3,520 W / 16 A</span>
              </div>
            </div>
          </section>
          {!current.online && (
            <div className="notice info">
              <AlertIcon />
              <span>
                This strip is offline. Measurements and relay states are last
                reported values. Switching is disabled.
              </span>
            </div>
          )}
          {current.online && !fresh && (
            <div className="notice warning">
              <AlertIcon />
              <span>
                Telemetry is missing or older than 30 seconds. Refresh the strip
                to verify measurements and protection status.
              </span>
            </div>
          )}
          <div className="section-heading outlet-section-heading">
            <div>
              <h3>Outlet control</h3>
              <span>Relay states change after device confirmation.</span>
            </div>
            <div className="action-row">
              <button
                className="btn btn-glass"
                onClick={() => onRefreshTelemetry(current.mac)}
                disabled={!canControl}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                className="btn btn-primary"
                disabled={!canEnable}
                onClick={() => onAllOn(current.mac)}
                title={
                  !canEnable
                    ? "Requires current telemetry with no protection trips"
                    : "Switch on all four outlets"
                }
              >
                <Power size={14} />
                All on
              </button>
              <button
                className="btn btn-glass"
                disabled={!canControl}
                onClick={() => onAllOff(current.mac)}
              >
                <PowerOff size={14} />
                All off
              </button>
            </div>
          </div>
          {pending[current.mac] && (
            <div className="notice info" role="status">
              <Loader2 className="spin" size={17} />
              {pending[current.mac]}. Waiting for device confirmation…
            </div>
          )}
          <div className="outlets-grid">
            {current.outlets.map((outlet) => (
              <OutletItem
                key={`${current.mac}:${outlet.channel}`}
                outlet={outlet}
                online={current.online}
                controlsAvailable={controlsAvailable}
                pending={busy}
                onHistory={() => props.onHistory?.(current.mac, outlet.channel)}
                onToggle={(on) =>
                  onToggleOutlet(current.mac, outlet.channel, on)
                }
                onUpdateName={(name) =>
                  onUpdateOutletName(
                    current.mac,
                    outlet.channel,
                    name,
                    outlet.icon,
                  )
                }
              />
            ))}
          </div>
          <section className="panel fleet-panel">
            <div className="section-heading">
              <div>
                <h3>Equipment register</h3>
                <span>
                  Connection, telemetry, and relay status for every strip.
                </span>
              </div>
              <span className="small-muted">{devices.length} registered</span>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Connection</th>
                    <th>Power</th>
                    <th>Channels 01–04</th>
                    <th>Last telemetry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr
                      key={device.mac}
                      className={
                        device.mac === current.mac ? "selected-row" : ""
                      }
                    >
                      <td>
                        <button
                          className="table-device-link"
                          onClick={() => onSelectMac(device.mac)}
                        >
                          <bdi data-i18n="off" dir="auto">
                            {displayName(device.alias)}
                          </bdi>
                        </button>
                        <span className="table-secondary">{device.mac}</span>
                      </td>
                      <td>
                        <StateBadge device={device} />
                      </td>
                      <td className="mono">
                        {deviceFresh(device)
                          ? `${device.total_power_w.toFixed(1)} W`
                          : "—"}
                      </td>
                      <td>
                        <div className="channel-indicators">
                          {[1, 2, 3, 4].map((channel) => {
                            const outlet = device.outlets.find(
                              (o) => o.channel === channel,
                            );
                            return (
                              <span
                                key={channel}
                                className={`channel-state ${device.online && outlet && telemetryFresh(outlet) ? (outlet.on ? "on" : "off") : ""}`}
                                title={`Channel ${channel}: ${outlet?.updated_at ? (outlet.on ? "on" : "off") : "unknown"}${!deviceFresh(device) ? " (last reported)" : ""}`}
                              >
                                {outlet?.updated_at
                                  ? outlet.on
                                    ? "ON"
                                    : "OFF"
                                  : "—"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="mono">
                        {relativeTime(
                          Math.max(
                            0,
                            ...device.outlets.map((o) => o.telemetry_at),
                          ),
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-glass btn-small"
                          disabled={
                            !controlsAvailable ||
                            !device.online ||
                            !!pending[device.mac] ||
                            globalBusy
                          }
                          onClick={() => onAllOff(device.mac)}
                        >
                          All off
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {visibleRemoved.length > 0 && (
        <section className="panel removed-panel">
          <div className="section-heading">
            <div>
              <h3>Removed strips</h3>
              <span>
                Incoming connections are ignored until you add a strip back.
                Saved names and history are retained.
              </span>
            </div>
            <button
              className="btn btn-glass"
              disabled={!native || !!pending.global}
              onClick={props.onClearRemoved}
            >
              <Trash2 size={16} />
              Clear list
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Strip</th>
                  <th>MAC address</th>
                  <th>Removed</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRemoved.map((device) => (
                  <tr key={device.mac}>
                    <td>
                      <bdi data-i18n="off" dir="auto">
                        {displayName(device.alias)}
                      </bdi>
                    </td>
                    <td className="mono">{device.mac}</td>
                    <td>
                      {new Date(device.removed_at * 1000).toLocaleString(
                        localeTag(),
                      )}
                    </td>
                    <td>
                      <div className="panel-actions">
                        <button
                          className="btn btn-glass"
                          onClick={() => props.onHistory?.(device.mac)}
                        >
                          History
                        </button>
                        <button
                          className="btn btn-glass"
                          disabled={
                            !native || !!pending[device.mac] || !!pending.global
                          }
                          onClick={() => {
                            void props.onRestore(device.mac);
                          }}
                        >
                          <Plus size={16} />
                          Add back
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {dialog && (
        <ConfirmDialog
          title={
            dialog.kind === "remove"
              ? `Remove ${dialog.device.alias}?`
              : `Reboot ${dialog.device.alias}?`
          }
          confirmLabel={
            dialog.kind === "remove" ? "Remove strip" : "Reboot strip"
          }
          danger={dialog.kind === "remove"}
          busy={dialogBusy}
          onConfirm={() => {
            void confirmAction();
          }}
          onClose={() => setDialog(null)}
        >
          <p className="mono">{dialog.device.mac}</p>
          {dialogAttempted && !dialogBusy && props.operationError && (
            <div className="notice error" role="alert">
              {props.operationError}
            </div>
          )}
          {dialog.kind === "remove" ? (
            <p>
              The strip will be disconnected and removed from the equipment
              register. Incoming connections will be ignored until you choose
              Add back. Saved names and event history are retained. Removing a
              strip does not switch off its outlets.
            </p>
          ) : (
            <p>
              The controller will send the documented reboot command and wait up
              to 60 seconds for a new connection and fresh telemetry. Reboot
              support and outlet behavior depend on the strip’s firmware.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>,
  );
}
function AlertIcon() {
  return localize(<ShieldAlert size={18} />);
}
