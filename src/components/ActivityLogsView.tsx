import { t, localize, localeTag } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertCircle, FileText, Search } from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import type { ActivityLog } from "../types";
export function ActivityLogsView({
  onManageData,
}: {
  onManageData: () => void;
}) {
  const native = isTauri();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLogs(await api.getActivityLogs(300));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!native) return;
    void fetchLogs();
    const off = [
      "relay-change",
      "device-connected",
      "device-disconnected",
      "data-cleared",
      "automation-update",
    ].map((event) =>
      api.onEvent(event, () => {
        void fetchLogs();
      }),
    );
    return () => off.forEach((fn) => fn());
  }, [fetchLogs, native]);
  const filtered = logs.filter((log) =>
    `${log.mac} ${log.event_type} ${log.details} ${t(log.event_type.replace(/_/g, " "))} ${t(log.details)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATING HISTORY</div>
          <h2>Activity log</h2>
          <p>
            Recorded device connections, relay changes, and controller events.
          </p>
        </div>
        <button className="btn btn-glass" onClick={onManageData}>
          <FileText size={17} />
          Clear / manage logs
        </button>
      </div>
      <section className="panel view-panel">
        <div className="section-heading">
          <div>
            <h3>Recent events</h3>
            <span>Latest 300 records · local controller history</span>
          </div>
          <button
            className="btn btn-glass"
            disabled={!native || loading}
            onClick={() => {
              void fetchLogs();
            }}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={17} />
            Unable to load events: {error}
          </div>
        )}
        <div className="search-field">
          <Search size={16} />
          <input
            dir="auto"
            aria-label="Filter activity events"
            placeholder="Filter by device, event, or detail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{filtered.length} events</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date / time</th>
                <th>Device</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="mono nowrap">
                      {new Date(log.timestamp * 1000).toLocaleString(
                        localeTag(),
                      )}
                    </td>
                    <td className="mono">{log.mac || "Controller"}</td>
                    <td>
                      <span
                        className={`tag-badge ${/error|trip|timeout/i.test(log.event_type) ? "trip" : log.event_type === "boot" ? "ok" : "neutral"}`}
                      >
                        {log.event_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="log-details">{log.details}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="table-empty">
                    {loading
                      ? "Loading controller events…"
                      : error
                        ? "Event history is unavailable. Retry to load records."
                        : !native
                          ? "Open the desktop application to read recorded device events."
                          : query
                            ? "No events match this filter."
                            : "No device events have been recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>,
  );
}
