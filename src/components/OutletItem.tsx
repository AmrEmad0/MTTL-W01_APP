import { displayName, localize } from "../i18n";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Thermometer,
  Clock,
  Check,
  X,
  Edit2,
} from "lucide-react";
import type { OutletState } from "../types";
import { outletFault, relativeTime, telemetryFresh } from "../status";
interface Props {
  outlet: OutletState;
  online: boolean;
  controlsAvailable: boolean;
  pending: boolean;
  onHistory?: () => void;
  onToggle: (on: boolean) => void;
  onUpdateName: (name: string) => Promise<boolean>;
}
export function OutletItem({
  outlet,
  online,
  controlsAvailable,
  pending,
  onHistory,
  onToggle,
  onUpdateName,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(outlet.custom_name);
  useEffect(() => {
    if (!editing) setName(outlet.custom_name);
  }, [outlet.custom_name, editing]);
  const fresh = online && telemetryFresh(outlet);
  const hasData = outlet.telemetry_at > 0;
  const tripped = outletFault(outlet);
  const knownRelay =
    outlet.updated_at > 0 && (!online || outlet.report_revision > 0);
  const disabled =
    !knownRelay ||
    !controlsAvailable ||
    !online ||
    pending ||
    (!outlet.on && (!fresh || tripped));
  async function saveName() {
    if (name.trim() && (await onUpdateName(name.trim()))) setEditing(false);
  }
  return localize(
    <article className={`outlet-card ${fresh && tripped ? "fault" : ""}`}>
      <div className="outlet-card-top">
        <span className="outlet-channel-badge">
          CH {String(outlet.channel).padStart(2, "0")}
        </span>
        <span
          className={`tag-badge ${fresh && tripped ? "trip" : online && knownRelay ? (outlet.on ? "ok" : "neutral") : "neutral"}`}
        >
          {fresh && tripped
            ? "Protection trip"
            : !knownRelay
              ? "Unknown"
              : `${outlet.on ? "On" : "Off"}${!fresh ? " · last reported" : ""}`}
        </span>
      </div>
      <div className="outlet-title-row">
        {editing ? (
          <form
            className="outlet-name-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input
              dir="auto"
              className="input-field"
              aria-label={`Channel ${outlet.channel} name`}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              required
            />
            <button
              className="btn btn-icon btn-glass"
              disabled={pending || !name.trim()}
              aria-label="Save outlet name"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-glass"
              disabled={pending}
              onClick={() => setEditing(false)}
              aria-label="Cancel rename"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            <h4>
              <bdi data-i18n="off" dir="auto">
                {displayName(outlet.custom_name || `Outlet ${outlet.channel}`)}
              </bdi>
            </h4>
            <button
              className="rename-button"
              disabled={!controlsAvailable || pending}
              aria-label={`Rename channel ${outlet.channel}`}
              onClick={() => {
                setName(outlet.custom_name);
                setEditing(true);
              }}
            >
              <Edit2 size={16} />
              <span>Rename</span>
            </button>
          </>
        )}
      </div>
      <div className="outlet-power">
        <span className={!fresh ? "muted" : ""}>
          {hasData ? outlet.power_w.toFixed(1) : "—"}
          <small>W</small>
        </span>
        <span className="small-muted">
          {fresh ? "Active power" : "Last reported power"}
        </span>
      </div>
      <dl className="outlet-stats-row">
        <div>
          <dt>Est. current</dt>
          <dd>
            {hasData ? outlet.estimated_current_a.toFixed(2) : "—"}
            <small>A</small>
          </dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>
            {hasData ? outlet.energy_kwh.toFixed(3) : "—"}
            <small>kWh</small>
          </dd>
        </div>
        <div>
          <dt>Temperature</dt>
          <dd>
            {hasData ? outlet.temperature_c : "—"}
            <small>°C</small>
          </dd>
        </div>
      </dl>
      <div className="outlet-health-tags">
        <span className={fresh && !outlet.overload_ok ? "danger-text" : ""}>
          {fresh && !outlet.overload_ok ? (
            <ShieldAlert size={14} />
          ) : (
            <ShieldCheck size={14} />
          )}
          Overload{" "}
          <strong>
            {!fresh ? "Unverified" : outlet.overload_ok ? "OK" : "TRIP"}
          </strong>
        </span>
        <span className={fresh && !outlet.overheat_ok ? "danger-text" : ""}>
          <Thermometer size={14} />
          Thermal{" "}
          <strong>
            {!fresh ? "Unverified" : outlet.overheat_ok ? "OK" : "TRIP"}
          </strong>
        </span>
      </div>
      {hasData && outlet.event_code !== "00" && (
        <p
          className={
            fresh && tripped ? "outlet-event danger-text" : "outlet-event"
          }
        >
          {outlet.event_desc} · {outlet.event_code}
          {!fresh && " · last reported"}
        </p>
      )}
      {onHistory && (
        <button className="btn btn-glass outlet-history" onClick={onHistory}>
          Outlet history & usage
        </button>
      )}
      <div className="outlet-control">
        <div>
          <strong>
            {pending
              ? "Awaiting confirmation"
              : !online
                ? "Device offline"
                : !knownRelay
                  ? "Awaiting relay state"
                  : outlet.on
                    ? "Outlet energized"
                    : "Outlet switched off"}
          </strong>
          <span>{relativeTime(outlet.telemetry_at)}</span>
        </div>
        <button
          className={`relay-switch ${knownRelay && outlet.on ? "active" : ""}`}
          role="switch"
          aria-checked={knownRelay && outlet.on}
          aria-label={`Channel ${outlet.channel} power`}
          disabled={disabled}
          onClick={() => onToggle(!outlet.on)}
          title={
            disabled
              ? pending
                ? "Waiting for device confirmation"
                : !online
                  ? "Strip is offline"
                  : "Fresh telemetry and clear protection required to switch on"
              : `Switch ${outlet.on ? "off" : "on"}`
          }
        >
          <span className="switch-thumb" />
        </button>
      </div>
      {hasData &&
        (outlet.countdown_sec > 0 || outlet.standby_cutoff_enabled) && (
          <div className="outlet-features">
            {outlet.countdown_sec > 0 && (
              <span>
                <Clock size={12} />
                Reported countdown: {outlet.countdown_sec}s
              </span>
            )}
            {outlet.standby_cutoff_enabled && (
              <span>Standby cutoff: {outlet.standby_threshold_w} W</span>
            )}
          </div>
        )}
    </article>,
  );
}
