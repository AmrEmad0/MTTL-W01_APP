import { t, displayName, localize, localeTag } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import type { ClearDataKind, DataStats, HistoryDevice } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
interface Props {
  initialAction?: ClearDataKind;
  busy: boolean;
  operationError: string;
  onClear: (
    kind: ClearDataKind,
    mac?: string,
    channel?: number,
  ) => Promise<boolean>;
}
const choices: { kind: ClearDataKind; title: string; description: string }[] = [
  {
    kind: "removed_list",
    title: "Clear Removed strips list",
    description:
      "Hide entries from the overview. Their MACs stay excluded, and names and history are retained. You can add them back by MAC.",
  },
  {
    kind: "activity",
    title: "Clear activity logs",
    description:
      "Delete recorded connection, relay, and controller events. Measurement history and equipment names are retained.",
  },
  {
    kind: "telemetry",
    title: "Clear telemetry history",
    description:
      "Delete saved measurements and their raw telemetry frames. Clearing one outlet also removes shared raw frames containing it. Current live readings and equipment names are retained.",
  },
  {
    kind: "recorded_data",
    title: "Clear all recorded data",
    description:
      "Delete telemetry history and activity logs for the selected strip or all strips. Equipment names and removed-MAC exclusions are retained.",
  },
  {
    kind: "database",
    title: "Reset entire database",
    description:
      "Delete all strips, names, notes, outlet metadata, measurements, events, cached states, removed-MAC exclusions, schedules, scenarios, and monitoring rules. Active controller sessions will disconnect.",
  },
];
export function DataManagementView({
  initialAction,
  busy,
  operationError,
  onClear,
}: Props) {
  const native = isTauri();
  const [stats, setStats] = useState<DataStats | null>(null),
    [catalog, setCatalog] = useState<HistoryDevice[]>([]),
    [mac, setMac] = useState(""),
    [channel, setChannel] = useState("all"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [action, setAction] = useState<ClearDataKind | null>(
      initialAction || null,
    ),
    [clearing, setClearing] = useState(false),
    [clearError, setClearError] = useState(""),
    [resetText, setResetText] = useState("");

  useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
  }, [initialAction]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [counts, devices] = await Promise.all([
        api.getDataStats(),
        api.getHistoryDevices(),
      ]);
      setStats(counts);
      setCatalog(devices);
      setMac((current) =>
        devices.some((device) => device.mac === current) ? current : "",
      );
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!native) return;
    void refresh();
    const off = api.onEvent("data-cleared", () => void refresh());
    return off;
  }, [native, refresh]);
  const selected = catalog.find((device) => device.mac === mac),
    choice = choices.find((item) => item.kind === action);
  const scope =
    action === "database"
      ? "All local data"
      : selected
        ? `${selected.alias} (${selected.mac})${action === "telemetry" && channel !== "all" ? ` · outlet ${channel}` : ""}`
        : "All strips";
  function open(kind: ClearDataKind) {
    setAction(kind);
    setClearError("");
    setResetText("");
  }
  async function clear() {
    if (
      !action ||
      clearing ||
      busy ||
      !native ||
      (action === "database" && resetText !== "RESET")
    )
      return;
    setClearing(true);
    setClearError("");
    try {
      const saved = await onClear(
        action,
        action === "database" ? undefined : mac || undefined,
        action === "telemetry" && channel !== "all"
          ? Number(channel)
          : undefined,
      );
      if (saved) {
        setAction(null);
        await refresh();
      } else setClearError("Stored data could not be cleared.");
    } catch (e) {
      setClearError(errorMessage(e));
    } finally {
      setClearing(false);
    }
  }
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL STORAGE</div>
          <h2>Data management</h2>
          <p>
            Choose what to clear and which equipment it applies to. New device
            reports continue recording afterward.
          </p>
        </div>
        <button
          className="btn btn-glass"
          disabled={!native || loading || busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={17} className={loading ? "spin" : ""} />
          Refresh counts
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {!native && (
        <div className="notice">
          Storage controls are available in the desktop application.
        </div>
      )}
      <div className="summary-grid">
        <div className="summary-card">
          <span>Saved strips</span>
          <strong className="summary-value">
            {stats?.devices.toLocaleString(localeTag()) ?? "—"}
          </strong>
          <p>
            {stats
              ? `${stats.removed_visible} visible removed · ${stats.removed_hidden} hidden removed`
              : "Counts unavailable"}
          </p>
        </div>
        <div className="summary-card">
          <span>Outlet measurements</span>
          <strong className="summary-value">
            {stats?.telemetry.toLocaleString(localeTag()) ?? "—"}
          </strong>
          <p>Saved telemetry records</p>
        </div>
        <div className="summary-card">
          <span>Captured frames</span>
          <strong className="summary-value">
            {stats?.frames.toLocaleString(localeTag()) ?? "—"}
          </strong>
          <p>Original telemetry reports</p>
        </div>
        <div className="summary-card">
          <span>Activity events</span>
          <strong className="summary-value">
            {stats?.activity.toLocaleString(localeTag()) ?? "—"}
          </strong>
          <p>Locally recorded events</p>
        </div>
      </div>
      <section className="panel view-panel data-scope">
        <div className="section-heading">
          <div>
            <h3>Clearing scope</h3>
            <span>
              Database reset always applies to all strips. Other actions use
              this selection.
            </span>
          </div>
          <Database size={22} />
        </div>
        <div className="history-date-grid">
          <label className="field-label">
            Strip
            <select
              className="input-field"
              value={mac}
              disabled={!native || busy || clearing}
              onChange={(e) => {
                setMac(e.target.value);
                setChannel("all");
              }}
            >
              <option value="">All strips</option>
              {catalog.map((device) => (
                <option data-i18n="off" key={device.mac} value={device.mac}>
                  {displayName(device.alias)} · {device.mac}
                  {device.removed ? " · removed" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Outlet (telemetry clearing only)
            <select
              className="input-field"
              disabled={!mac || busy || clearing}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">All outlets</option>
              {selected?.outlets.map((outlet) => (
                <option
                  data-i18n="off"
                  value={outlet.channel}
                  key={outlet.channel}
                >
                  {t("CH")} {outlet.channel} · {displayName(outlet.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <div className="data-actions">
        {choices.map((item) => (
          <section
            className={`panel data-action ${item.kind === "database" ? "database-reset" : ""}`}
            key={item.kind}
          >
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
            <button
              className={`btn ${item.kind === "database" ? "btn-danger" : "btn-glass"}`}
              disabled={!native || busy || loading}
              onClick={() => open(item.kind)}
            >
              <Trash2 size={17} />
              {item.kind === "database" ? "Reset database" : "Clear"}
            </button>
          </section>
        ))}
      </div>
      {choice && (
        <ConfirmDialog
          title={`${choice.title}?`}
          confirmLabel={
            action === "database" ? "Reset database" : "Clear selected data"
          }
          busy={clearing || busy}
          confirmDisabled={
            !native || (action === "database" && resetText !== "RESET")
          }
          danger
          onConfirm={() => void clear()}
          onClose={() => setAction(null)}
        >
          <p>
            <strong>Scope: {scope}</strong>
          </p>
          <p>{choice.description}</p>
          {action === "database" ? (
            <>
              <p>
                Physical Wi-Fi settings and outlet power are unchanged. Strips
                configured for this controller may reconnect and register again
                with default names. This deletion cannot be undone.
              </p>
              <label className="field-label">
                Type RESET to confirm
                <input
                  dir="ltr"
                  className="input-field"
                  value={resetText}
                  disabled={clearing}
                  onChange={(e) => setResetText(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          ) : action !== "removed_list" ? (
            <p>
              These saved records will be permanently deleted. Recording resumes
              when new reports arrive.
            </p>
          ) : (
            <p>
              History remains available under Usage & history, including after
              clearing this list.
            </p>
          )}
          {clearError && (
            <div className="notice error" role="alert">
              {operationError || clearError}
            </div>
          )}
        </ConfirmDialog>
      )}
    </>,
  );
}
