import { t, displayName, localize, localeTag } from "../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  RefreshCw,
  Pencil,
  BarChart3,
} from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import { historyCsv, localDateInput } from "../history";
import type { HistoryChart, HistoryDevice, HistoryPage } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { UsageChart } from "./UsageChart";
interface Props {
  active?: boolean;
  historyTarget?: { mac: string; channel?: number; token?: number };
  initialMac: string;
  initialChannel?: number;
  busy: boolean;
  operationError: string;
  onRenameStrip: (mac: string, name: string, notes: string) => Promise<boolean>;
  onRenameOutlet: (
    mac: string,
    channel: number,
    name: string,
    icon: string,
  ) => Promise<boolean>;
  onManageData: () => void;
}
const value = (number: number | null | undefined, decimals = 1) =>
  number == null ? "—" : number.toFixed(decimals);
const flag = (state: boolean | null) =>
  state === null ? "Not recorded" : state ? "OK" : "TRIP";
export function HistoryView({
  active = true,
  historyTarget,
  initialMac,
  initialChannel,
  busy,
  operationError,
  onRenameStrip,
  onRenameOutlet,
  onManageData,
}: Props) {
  const native = isTauri();
  const now = Math.floor(Date.now() / 1000);
  const [catalog, setCatalog] = useState<HistoryDevice[]>([]),
    [mac, setMac] = useState<string>(() => {
      if (initialMac) return initialMac;
      try {
        const saved = localStorage.getItem("mttl_history_mac");
        if (saved) return saved;
      } catch {}
      return "";
    }),
    [channel, setChannel] = useState<string>(() => {
      if (initialChannel !== undefined) return String(initialChannel);
      try {
        const saved = localStorage.getItem("mttl_history_channel");
        if (saved) return saved;
      } catch {}
      return "all";
    });
  const [period, setPeriod] = useState<string>(() => {
      try {
        const saved = localStorage.getItem("mttl_history_period");
        if (saved) return saved;
      } catch {}
      return "24";
    }),
    [customFrom, setCustomFrom] = useState(localDateInput(now - 86400)),
    [customTo, setCustomTo] = useState(localDateInput(now));
  const [chart, setChart] = useState<HistoryChart | null>(null),
    [page, setPage] = useState<HistoryPage>({ records: [], next_before: null });
  const [range, setRange] = useState({ from: now - 86400, to: now + 1 });
  const [loading, setLoading] = useState(false),
    [moreBusy, setMoreBusy] = useState(false),
    [error, setError] = useState("");
  const [rename, setRename] = useState<"strip" | "outlet" | null>(null),
    [name, setName] = useState(""),
    [renaming, setRenaming] = useState(false),
    [renameError, setRenameError] = useState("");
  const request = useRef(0);

  // Sync chosen device & channel to localStorage
  useEffect(() => {
    if (mac) {
      try {
        localStorage.setItem("mttl_history_mac", mac);
      } catch {}
    }
  }, [mac]);

  useEffect(() => {
    try {
      localStorage.setItem("mttl_history_channel", channel);
    } catch {}
  }, [channel]);

  useEffect(() => {
    try {
      localStorage.setItem("mttl_history_period", period);
    } catch {}
  }, [period]);

  // Handle explicit navigation from Dashboard outlet click
  const lastTargetToken = useRef<number | undefined>(historyTarget?.token);
  useEffect(() => {
    if (
      historyTarget?.token &&
      historyTarget.token !== lastTargetToken.current
    ) {
      lastTargetToken.current = historyTarget.token;
      if (historyTarget.mac) setMac(historyTarget.mac);
      if (historyTarget.channel !== undefined) {
        setChannel(String(historyTarget.channel));
      } else {
        setChannel("all");
      }
    }
  }, [historyTarget]);

  const selected = catalog.find((device) => device.mac === mac),
    selectedOutlet = selected?.outlets.find(
      (outlet) => String(outlet.channel) === channel,
    );
  const refreshCatalog = useCallback(async () => {
    const list = await api.getHistoryDevices();
    setCatalog(list);
    setMac((current) =>
      list.some((device) => device.mac === current)
        ? current
        : list[0]?.mac || "",
    );
  }, []);
  useEffect(() => {
    if (!native) return;
    let activeEffect = true;
    void api
      .getHistoryDevices()
      .then((list) => {
        if (!activeEffect) return;
        setCatalog(list);
        setMac((current) => {
          if (current && list.some((device) => device.mac === current))
            return current;
          if (initialMac && list.some((device) => device.mac === initialMac))
            return initialMac;
          return list[0]?.mac || "";
        });
      })
      .catch((e) => {
        if (activeEffect) setError(errorMessage(e));
      });
    const off = api.onEvent("data-cleared", () => {
      void refreshCatalog().catch((e) => setError(errorMessage(e)));
    });
    return () => {
      activeEffect = false;
      off();
    };
  }, [native, refreshCatalog, initialMac]);
  const load = useCallback(async () => {
    const version = ++request.current;
    setError("");
    // Keep previous chart and page data during re-fetch to prevent flashing/flickering
    if (!native || !mac) {
      setLoading(false);
      return;
    }
    const step = Number(period) <= 1 ? 10 : 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const to =
      period === "custom"
        ? Math.floor(new Date(customTo).getTime() / 1000)
        : Math.floor(nowSec / step) * step + step;
    const from =
      period === "custom"
        ? Math.floor(new Date(customFrom).getTime() / 1000)
        : to - Number(period) * 3600;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to <= from ||
      to - from > 31 * 86400
    ) {
      setError("Choose a valid date interval up to 31 days.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setRange({ from, to });
    try {
      const [data, records] = await Promise.all([
        api.getHistoryChart(
          mac,
          channel === "all" ? undefined : Number(channel),
          from,
          to,
        ),
        api.getHistoryPage(
          mac,
          channel === "all" ? undefined : Number(channel),
          from,
          to,
        ),
      ]);
      if (version === request.current) {
        setChart(data);
        setPage(records);
      }
    } catch (e) {
      if (version === request.current) setError(errorMessage(e));
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [native, mac, channel, period, customFrom, customTo]);
  useEffect(() => {
    void load();
    const requestVersion = request;
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  const prevActive = useRef(active);
  useEffect(() => {
    if (!prevActive.current && active) {
      void load();
    }
    prevActive.current = active;
  }, [active, load]);
  useEffect(() => {
    if (!native) return;
    return api.onEvent("data-cleared", () => {
      void load();
    });
  }, [native, load]);
  async function more() {
    if (!page.next_before || moreBusy) return;
    const version = request.current;
    setMoreBusy(true);
    try {
      const next = await api.getHistoryPage(
        mac,
        channel === "all" ? undefined : Number(channel),
        range.from,
        range.to,
        page.next_before,
      );
      if (version === request.current)
        setPage((current) => ({
          records: [...current.records, ...next.records],
          next_before: next.next_before,
        }));
    } catch (e) {
      if (version === request.current) setError(errorMessage(e));
    } finally {
      setMoreBusy(false);
    }
  }
  function exportRecords() {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([historyCsv(page.records)], { type: "text/csv;charset=utf-8" }),
    );
    link.href = url;
    link.download = `mttl-${mac}-${channel}-history.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveName() {
    if (!selected || !name.trim() || renaming) return;
    setRenaming(true);
    setRenameError("");
    try {
      const saved =
        rename === "strip"
          ? await onRenameStrip(mac, name.trim(), selected.notes)
          : await onRenameOutlet(
              mac,
              Number(channel),
              name.trim(),
              selectedOutlet?.icon || "plug",
            );
      if (saved) {
        await refreshCatalog();
        setRename(null);
      } else setRenameError("Name could not be saved.");
    } catch (e) {
      setRenameError(errorMessage(e));
    } finally {
      setRenaming(false);
    }
  }
  const summary = chart?.summary;
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RECORDED MEASUREMENTS</div>
          <h2>Usage & history</h2>
          <p>
            Review electricity use, load, temperature, and protection events for
            each strip and outlet.
          </p>
        </div>
        <button className="btn btn-glass" onClick={onManageData}>
          Manage stored data
        </button>
      </div>
      <section className="panel view-panel history-filters">
        <div className="section-heading">
          <div>
            <h3>History selection</h3>
            <span>
              {selected?.removed
                ? "Removed strip · archived history remains available"
                : "Readings are stored in the local database as they arrive"}
            </span>
          </div>
          <button
            className="btn btn-glass"
            disabled={!native || !mac || loading}
            onClick={() => void load()}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
        <div className="history-filter-grid">
          <label className="field-label">
            Strip
            <select
              className="input-field"
              disabled={!native || busy}
              value={mac}
              onChange={(e) => {
                setMac(e.target.value);
                setChannel("all");
              }}
            >
              <option value="">
                {native
                  ? "Select a saved strip"
                  : "Desktop application required"}
              </option>
              {catalog.map((device) => (
                <option data-i18n="off" value={device.mac} key={device.mac}>
                  {displayName(device.alias)} · {device.mac}
                  {device.removed ? " · removed" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Outlet
            <select
              className="input-field"
              disabled={!mac || busy}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">Whole strip · all four outlets</option>
              {selected?.outlets.map((outlet) => (
                <option
                  data-i18n="off"
                  key={outlet.channel}
                  value={outlet.channel}
                >
                  {t("CH")} {outlet.channel} · {displayName(outlet.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Period
            <select
              className="input-field"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="1">Last hour</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
        </div>
        {period === "custom" && (
          <div className="history-date-grid">
            <label className="field-label">
              From
              <input
                dir="ltr"
                type="datetime-local"
                className="input-field"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="field-label">
              To
              <input
                dir="ltr"
                type="datetime-local"
                className="input-field"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="panel-actions">
          <button
            className="btn btn-glass"
            disabled={!native || !selected || busy}
            onClick={() => {
              setName(selected!.alias);
              setRenameError("");
              setRename("strip");
            }}
          >
            <Pencil size={15} />
            Rename strip
          </button>
          <button
            className="btn btn-glass"
            disabled={!native || !selectedOutlet || busy}
            onClick={() => {
              setName(selectedOutlet!.name);
              setRenameError("");
              setRename("outlet");
            }}
          >
            <Pencil size={15} />
            Rename selected outlet
          </button>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {!native && (
          <p className="field-hint">
            Open the desktop application to read physical-device history. No
            sample data is generated.
          </p>
        )}
        {native && !catalog.length && !error && (
          <p className="field-hint">
            No saved strips yet. Connect a strip to begin recording. Removed
            strips also remain available here.
          </p>
        )}
      </section>
      <div className="summary-grid history-summary">
        <div className="summary-card">
          <span>Observed energy</span>
          <strong className="summary-value">
            {value(summary?.observed_energy_kwh, 3)}
            <small>kWh</small>
          </strong>
          <p>Captured counter increases</p>
        </div>
        <div className="summary-card">
          <span>Average load</span>
          <strong className="summary-value">
            {value(summary?.average_power_w)}
            <small>W</small>
          </strong>
          <p>Mean of recorded samples</p>
        </div>
        <div className="summary-card">
          <span>Peak load</span>
          <strong className="summary-value">
            {value(summary?.peak_power_w)}
            <small>W</small>
          </strong>
          <p>Highest captured load</p>
        </div>
        <div className="summary-card">
          <span>Highest temperature</span>
          <strong className="summary-value">
            {value(summary?.max_temperature_c, 0)}
            <small>°C</small>
          </strong>
          <p>
            {summary?.record_count.toLocaleString(localeTag()) || 0} outlet
            readings
          </p>
        </div>
      </div>
      <div className="notice info">
        <BarChart3 size={18} />
        <span>
          Usage comes from positive changes in the strip’s energy counters. Gaps
          over 30 seconds and counter resets are excluded. Missing readings stay
          empty.
          {summary
            ? ` ${summary.counter_resets} counter resets · ${summary.gap_intervals} gap intervals excluded.`
            : ""}
        </span>
      </div>
      {loading && (
        <div className="notice" role="status">
          Loading saved measurements…
        </div>
      )}
      <div className="history-charts">
        <UsageChart
          title="Active power"
          unit="W"
          metric="average_power_w"
          points={chart?.points || []}
          bucketSeconds={chart?.bucket_seconds || 10}
          from={range.from}
          to={range.to}
        />
        <UsageChart
          title="Electricity usage"
          unit="kWh"
          metric="energy_kwh"
          points={chart?.points || []}
          bucketSeconds={chart?.bucket_seconds || 10}
          from={range.from}
          to={range.to}
        />
        <UsageChart
          title="Temperature"
          unit="°C"
          metric="temperature_c"
          points={chart?.points || []}
          bucketSeconds={chart?.bucket_seconds || 10}
          from={range.from}
          to={range.to}
        />
        <section className="panel usage-chart">
          <div className="section-heading">
            <div>
              <h3>Usage by outlet</h3>
              <span>
                {channel === "all"
                  ? "Observed energy in the selected interval"
                  : "Selected outlet"}
              </span>
            </div>
          </div>
          {!chart?.outlets.some(
            (outlet) => outlet.observed_energy_kwh !== null,
          ) ? (
            <div className="chart-empty">
              Outlet usage appears after enough counter readings have been
              captured.
            </div>
          ) : (
            chart.outlets.map((outlet) => {
              const max = Math.max(
                0.001,
                ...chart.outlets.map((item) => item.observed_energy_kwh || 0),
              );
              return (
                <div className="usage-outlet-row" key={outlet.channel}>
                  <span>
                    CH {outlet.channel} ·{" "}
                    <bdi data-i18n="off" dir="auto">
                      {displayName(outlet.name)}
                    </bdi>
                  </span>
                  <strong>{value(outlet.observed_energy_kwh, 3)} kWh</strong>
                  <div className="usage-outlet-track">
                    <div
                      style={{
                        width: `${((outlet.observed_energy_kwh || 0) / max) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
      <section className="panel view-panel">
        <div className="section-heading">
          <div>
            <h3>Captured outlet readings</h3>
            <span>
              {page.records.length} loaded
              {summary
                ? ` of ${summary.record_count.toLocaleString(localeTag())} records`
                : ""}{" "}
              · newest first · local time
            </span>
          </div>
          <button
            className="btn btn-glass"
            disabled={!page.records.length}
            onClick={exportRecords}
          >
            <Download size={16} />
            Export loaded CSV
          </button>
        </div>
        <div className="table-container history-records">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Outlet</th>
                <th>Relay</th>
                <th>Power</th>
                <th>Energy counter</th>
                <th>Temperature</th>
                <th>Protection</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {page.records.length ? (
                page.records.map((record) => (
                  <tr key={record.id}>
                    <td className="mono nowrap">
                      {new Date(record.recorded_at * 1000).toLocaleString(
                        localeTag(),
                      )}
                    </td>
                    <td>
                      CH {record.channel}
                      <span className="table-secondary">
                        <bdi data-i18n="off" dir="auto">
                          {displayName(
                            selected?.outlets.find(
                              (outlet) => outlet.channel === record.channel,
                            )?.name || "",
                          )}
                        </bdi>
                      </span>
                    </td>
                    <td>{record.relay_on ? "On" : "Off"}</td>
                    <td className="mono nowrap">
                      {record.power_w.toFixed(1)} W
                    </td>
                    <td className="mono nowrap">
                      {record.energy_kwh.toFixed(3)} kWh
                    </td>
                    <td className="mono nowrap">{record.temperature_c} °C</td>
                    <td>
                      <span>Overload {flag(record.overload_ok)}</span>
                      <span className="table-secondary">
                        Thermal {flag(record.overheat_ok)} · Event{" "}
                        {record.event_code}
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary>All fields</summary>
                        <dl className="history-details">
                          <dt>Secondary counter</dt>
                          <dd>{record.secondary_energy_kwh.toFixed(3)} kWh</dd>
                          <dt>Energy budget</dt>
                          <dd>{value(record.energy_budget_kwh, 3)} kWh</dd>
                          <dt>Countdown</dt>
                          <dd>{record.countdown_sec ?? "Not recorded"} s</dd>
                          <dt>Standby threshold</dt>
                          <dd>
                            {record.standby_threshold_w ?? "Not recorded"} W
                          </dd>
                          <dt>Standby cutoff</dt>
                          <dd>
                            {record.standby_cutoff_enabled === null
                              ? "Not recorded"
                              : record.standby_cutoff_enabled
                                ? "Enabled"
                                : "Disabled"}
                          </dd>
                        </dl>
                        {record.raw_frame && (
                          <pre className="history-raw">
                            <bdi data-i18n="off" dir="ltr">
                              {record.raw_frame}
                            </bdi>
                          </pre>
                        )}
                      </details>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="table-empty">
                    {loading
                      ? "Loading records…"
                      : !mac
                        ? "Select a saved strip to view its measurements."
                        : error
                          ? "History unavailable. Correct the error and refresh."
                          : "No telemetry was captured in this interval."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {page.next_before && (
          <button
            className="btn btn-glass load-more"
            disabled={moreBusy || loading}
            onClick={() => void more()}
          >
            {moreBusy ? "Loading…" : "Load 100 more readings"}
          </button>
        )}
        <p className="field-hint history-caption">
          Older records keep their original values. Fields that were not
          previously stored are marked “Not recorded”. Charts use the entire
          selected interval, including records beyond the table page.
        </p>
      </section>
      {rename && (
        <ConfirmDialog
          title={rename === "strip" ? "Rename strip" : "Rename outlet"}
          confirmLabel="Save name"
          busy={renaming || busy}
          confirmDisabled={!name.trim()}
          onConfirm={() => void saveName()}
          onClose={() => setRename(null)}
        >
          <label className="field-label">
            {rename === "strip" ? "Strip name" : "Outlet name"}
            <input
              dir="auto"
              className="input-field"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              disabled={renaming}
            />
          </label>
          {renameError && (
            <div className="notice error" role="alert">
              {operationError || renameError}
            </div>
          )}
          <p>
            History is associated with the physical MAC and outlet channel.
            Renaming keeps all measurements.
          </p>
        </ConfirmDialog>
      )}
    </>,
  );
}
