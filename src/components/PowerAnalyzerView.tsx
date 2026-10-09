import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  Zap,
  TrendingUp,
  Clock,
  Thermometer,
  Plus,
  Trash2,
  BellRing,
} from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import { displayName, localize, t, useLanguage } from "../i18n";
import { localDateInput } from "../history";
import { durationLabel, type AutomationController } from "../automation";
import {
  analysisCsv,
  pairedPowerDifference,
  type AnalysisSeries,
} from "../analyzer";
import { telemetryFresh } from "../status";
import type { DeviceInfo, HistoryDevice, OutletTarget } from "../types";
import { PowerComparisonChart } from "./PowerComparisonChart";
import { MonitorRules } from "./MonitorRules";
import { readPreference, writePreference } from "../preferences";

const value = (n: number | null | undefined, decimals = 1) =>
  n == null ? "—" : n.toFixed(decimals);

export function PowerAnalyzerView({
  active = true,
  devices,
  initialMac,
  controller,
  commandBusy,
}: {
  active?: boolean;
  devices: DeviceInfo[];
  initialMac: string;
  controller: AutomationController;
  commandBusy: boolean;
}) {
  const native = isTauri();
  const language = useLanguage();
  const [catalog, setCatalog] = useState<HistoryDevice[]>([]);
  const [targets, setTargets] = useState<OutletTarget[]>(() => {
    try {
      const saved = readPreference("mttl_analyzer_targets");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is OutletTarget =>
              item !== null &&
              typeof item === "object" &&
              typeof item.mac === "string" &&
              /^[0-9A-F]{12}$/i.test(item.mac) &&
              Number.isInteger(item.channel) &&
              item.channel >= 1 &&
              item.channel <= 4,
          );
          return valid
            .filter(
              (item, index) =>
                valid.findIndex(
                  (other) =>
                    other.mac === item.mac && other.channel === item.channel,
                ) === index,
            )
            .slice(0, 4);
        }
      }
    } catch {}
    return [];
  });
  const [period, setPeriod] = useState<string>(() => {
    const saved = readPreference("mttl_analyzer_period");
    return saved && ["1", "24", "168", "720", "custom"].includes(saved)
      ? saved
      : "1";
  });
  const [customFrom, setCustomFrom] = useState(
    localDateInput(Math.floor(Date.now() / 1000) - 3600),
  );
  const [customTo, setCustomTo] = useState(
    localDateInput(Math.floor(Date.now() / 1000)),
  );
  const [series, setSeries] = useState<AnalysisSeries[]>([]);
  const [range, setRange] = useState({ from: 0, to: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    return readPreference("mttl_analyzer_auto_refresh") === "true";
  });
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = readPreference("mttl_analyzer_interval");
    const num = Number(saved);
    return Number.isInteger(num) && num >= 1 && num <= 60 ? num : 10;
  });
  const [tariff, setTariff] = useState<string>(() => {
    return readPreference("mttl_analyzer_tariff") || "";
  });
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showMonitorRules, setShowMonitorRules] = useState(false);
  const request = useRef(0);

  // Sync configuration to localStorage so choices survive reloads and tab changes
  useEffect(() => {
    writePreference("mttl_analyzer_targets", JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    writePreference("mttl_analyzer_period", period);
  }, [period]);

  useEffect(() => {
    writePreference("mttl_analyzer_interval", String(refreshInterval));
  }, [refreshInterval]);

  useEffect(() => {
    writePreference("mttl_analyzer_auto_refresh", String(autoRefresh));
  }, [autoRefresh]);

  useEffect(() => {
    writePreference("mttl_analyzer_tariff", tariff);
  }, [tariff]);

  // Load available devices from history catalog
  useEffect(() => {
    if (!native) return;
    let activeCatalog = true;

    const loadCatalog = () =>
      api
        .getHistoryDevices()
        .then((list) => {
          if (!activeCatalog) return;
          setCatalog(list);
          setTargets((current) => {
            if (current.length) {
              const valid = current.filter((target) =>
                list.some((device) => device.mac === target.mac),
              );
              if (valid.length) return valid;
            }
            if (list.length) {
              const defaultMac =
                list.find((d) => d.mac === initialMac)?.mac || list[0].mac;
              return [{ mac: defaultMac, channel: 1 }];
            }
            return [];
          });
        })
        .catch((e) => {
          if (activeCatalog) setError(errorMessage(e));
        });

    void loadCatalog();
    const off = api.onEvent("data-cleared", () => {
      void loadCatalog();
      void loadRef.current();
    });

    return () => {
      activeCatalog = false;
      off();
    };
  }, [native, initialMac]);

  // Load analysis data
  const load = useCallback(async () => {
    const version = ++request.current;
    setError("");
    // Keep previous series during re-fetch to prevent flashing/flickering

    if (!native || !targets.length) {
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
      setError("Please choose a valid time interval up to 31 days.");
      setLoading(false);
      return;
    }

    setRange({ from, to });
    setLoading(true);

    try {
      const data = await Promise.all(
        targets.map(async (target) => {
          const device = catalog.find((d) => d.mac === target.mac);
          const outletMeta = device?.outlets.find(
            (o) => o.channel === target.channel,
          );
          const name = `${displayName(device?.alias || target.mac)} · CH ${target.channel} · ${displayName(outletMeta?.name || `Outlet ${target.channel}`)}`;
          return {
            target,
            name,
            chart: await api.getHistoryChart(
              target.mac,
              target.channel,
              from,
              to,
            ),
          };
        }),
      );
      if (version === request.current) setSeries(data);
    } catch (e) {
      if (version === request.current) setError(errorMessage(e));
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [native, targets, period, customFrom, customTo, catalog]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
    const requestVersion = request;
    return () => {
      requestVersion.current++;
    };
  }, [load, language]);

  // Auto-refresh interval (configurable from 1s to 60s, pauses when tab is hidden)
  useEffect(() => {
    if (!native || !autoRefresh || !active || period === "custom") return;
    const intervalSec = Math.max(
      1,
      Math.min(60, Number(refreshInterval) || 10),
    );
    const timer = setInterval(() => {
      void loadRef.current();
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [native, autoRefresh, active, period, refreshInterval]);

  // When switching back to this tab, refresh data smoothly
  const prevActive = useRef(active);
  useEffect(() => {
    if (!prevActive.current && active) {
      void loadRef.current();
    }
    prevActive.current = active;
  }, [active]);

  // Target helpers
  function setTarget(index: number, key: string) {
    const [mac, channel] = key.split(":");
    setTargets((current) =>
      current.map((target, i) =>
        i === index ? { mac, channel: Number(channel) } : target,
      ),
    );
  }

  function addTarget() {
    const next = catalog
      .flatMap((device) =>
        [1, 2, 3, 4].map((channel) => ({ mac: device.mac, channel })),
      )
      .find(
        (target) =>
          !targets.some(
            (current) =>
              current.mac === target.mac && current.channel === target.channel,
          ),
      );
    if (next) setTargets((current) => [...current, next]);
  }

  function removeTarget(index: number) {
    setTargets((current) => current.filter((_, i) => i !== index));
  }

  // Delta calculation for 2 outlets
  const delta =
    series.length === 2
      ? pairedPowerDifference(series[0].chart, series[1].chart)
      : null;

  const rate =
    tariff.trim() && Number.isFinite(Number(tariff)) && Number(tariff) >= 0
      ? Number(tariff)
      : null;

  function exportData() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", analysisCsv(series)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `mttl-power-analysis-${range.from}-${range.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const primarySeries = series[0];
  const primarySummary = primarySeries?.chart.summary;
  const primaryDevice = primarySeries
    ? devices.find((d) => d.mac === primarySeries.target.mac)
    : undefined;
  const primaryOutlet = primaryDevice?.outlets.find(
    (o) => o.channel === primarySeries?.target.channel,
  );
  const primaryFresh =
    !!primaryDevice?.online && !!primaryOutlet && telemetryFresh(primaryOutlet);

  return localize(
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">POWER ANALYSIS</span>
          <h2>Power analyzer</h2>
          <p>
            Inspect electrical behavior, analyze energy consumption, and compare
            outlets.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-glass"
            disabled={
              !series.some((item) => item.chart.points.length) || loading
            }
            onClick={exportData}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {!native && (
        <div className="notice info" role="status">
          <strong>Desktop application required</strong>
          <p>
            Saved physical-device readings appear here. No sample data is
            generated.
          </p>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {controller.error && (
        <div className="notice error" role="alert">
          {controller.error}
        </div>
      )}

      <section className="panel view-panel" style={{ marginBottom: "22px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
              Outlets to analyze
            </h3>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {targets.length === 1
                ? "Inspecting single outlet"
                : `Comparing ${targets.length} outlets side-by-side`}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {targets.length < 4 && (
              <button
                type="button"
                className="btn btn-subtle"
                style={{
                  fontSize: "0.85rem",
                  padding: "4px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                disabled={!native || targets.length >= catalog.length * 4}
                onClick={addTarget}
              >
                <Plus size={14} />
                {targets.length === 1
                  ? "Compare with another outlet"
                  : "Add outlet"}
              </button>
            )}
          </div>
        </div>

        {/* OUTLET SELECTORS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`,
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          {targets.map((target, index) => (
            <div
              key={index}
              className={`series-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "var(--surface-subtle)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span className="series-swatch" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "2px",
                  }}
                >
                  {targets.length > 1
                    ? `Outlet ${index + 1}`
                    : "Selected Outlet"}
                </span>
                <select
                  className="input-field"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "0.875rem",
                  }}
                  value={`${target.mac}:${target.channel}`}
                  onChange={(e) => setTarget(index, e.target.value)}
                >
                  {catalog.flatMap((device) =>
                    [1, 2, 3, 4].map((channel) => (
                      <option
                        data-i18n="off"
                        key={`${device.mac}:${channel}`}
                        value={`${device.mac}:${channel}`}
                        disabled={targets.some(
                          (other, i) =>
                            i !== index &&
                            other.mac === device.mac &&
                            other.channel === channel,
                        )}
                      >
                        {displayName(device.alias)} · CH {channel} ·{" "}
                        {displayName(
                          device.outlets.find((o) => o.channel === channel)
                            ?.name || `Outlet ${channel}`,
                        )}
                        {device.removed ? ` · ${t("Removed")}` : ""}
                      </option>
                    )),
                  )}
                </select>
              </div>

              {targets.length > 1 && (
                <button
                  type="button"
                  className="btn-ghost icon-button"
                  style={{ color: "var(--text-muted)", padding: "6px" }}
                  title="Remove from comparison"
                  onClick={() => removeTarget(index)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* TIMEFRAME PILLS & TARIFF */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "14px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginInlineEnd: "4px",
              }}
            >
              Interval:
            </span>
            {[
              { id: "1", label: "1 Hour" },
              { id: "24", label: "24 Hours" },
              { id: "168", label: "7 Days" },
              { id: "720", label: "30 Days" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn ${period === p.id ? "btn-primary" : "btn-subtle"}`}
                style={{
                  fontSize: "0.8rem",
                  padding: "4px 10px",
                  borderRadius: "16px",
                }}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>Tariff / kWh:</span>
              <input
                className="input-field"
                type="number"
                min={0}
                step="any"
                value={tariff}
                placeholder="Optional"
                onChange={(e) => setTariff(e.target.value)}
                style={{
                  width: "90px",
                  padding: "4px 8px",
                  fontSize: "0.85rem",
                }}
                title="Use your local currency per kWh."
              />
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <label
                className="checkbox-label"
                style={{ fontSize: "0.85rem", cursor: "pointer", margin: 0 }}
              >
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  disabled={!native || period === "custom"}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>every</span>
                <input
                  dir="ltr"
                  className="input-field"
                  type="number"
                  min={1}
                  max={60}
                  aria-label="Refresh interval in seconds"
                  disabled={!autoRefresh || !native || period === "custom"}
                  value={refreshInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (Number.isFinite(val)) {
                      setRefreshInterval(Math.max(1, Math.min(60, val)));
                    } else if (e.target.value === "") {
                      setRefreshInterval(1);
                    }
                  }}
                  style={{
                    width: "52px",
                    padding: "3px 6px",
                    fontSize: "0.825rem",
                    textAlign: "center",
                  }}
                />
                <span style={{ color: "var(--text-muted)" }}>sec</span>
                <div
                  style={{
                    display: "inline-flex",
                    gap: "3px",
                    marginInlineStart: "2px",
                  }}
                >
                  {[1, 2, 5, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!autoRefresh || !native || period === "custom"}
                      className={`btn ${refreshInterval === s ? "btn-primary" : "btn-subtle"}`}
                      style={{
                        padding: "1px 5px",
                        fontSize: "0.725rem",
                        minHeight: "22px",
                        borderRadius: "10px",
                      }}
                      onClick={() => setRefreshInterval(s)}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-glass"
              style={{
                padding: "4px 10px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              disabled={!native || !targets.length || loading}
              onClick={() => void load()}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* CUSTOM DATE INTERVAL (Only shown when period === 'custom') */}
        {period === "custom" && (
          <div
            style={{
              marginTop: "14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <label className="field-label">
              From
              <input
                className="input-field"
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="field-label">
              To
              <input
                className="input-field"
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      {/* 2. HERO KPI METRIC CARDS (High-Visibility Insights At A Glance) */}
      {primarySummary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "14px",
            marginBottom: "22px",
          }}
        >
          {/* Card 1: Current Power */}
          <div
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Current Load
              </span>
              <Zap size={16} style={{ color: "var(--accent-cyan)" }} />
            </div>
            <strong
              style={{
                fontSize: "1.75rem",
                fontFamily: "var(--font-mono)",
                margin: "8px 0 4px 0",
              }}
            >
              {primaryFresh ? `${primaryOutlet.power_w.toFixed(1)} W` : "—"}
            </strong>
            <span
              style={{
                fontSize: "0.8rem",
                color:
                  primaryFresh && primaryOutlet.on
                    ? "var(--success-text)"
                    : "var(--text-muted)",
              }}
            >
              {!primaryDevice?.online
                ? "Offline"
                : primaryFresh
                  ? primaryOutlet.on
                    ? "● Relay Active"
                    : "○ Relay Off"
                  : "Stale"}
            </span>
          </div>

          {/* Card 2: Observed Energy */}
          <div
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Total Energy
              </span>
              <TrendingUp size={16} style={{ color: "var(--success-text)" }} />
            </div>
            <strong
              style={{
                fontSize: "1.75rem",
                fontFamily: "var(--font-mono)",
                margin: "8px 0 4px 0",
              }}
            >
              {value(primarySummary.observed_energy_kwh, 3)}{" "}
              <small style={{ fontSize: "1rem" }}>kWh</small>
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {rate !== null && primarySummary.observed_energy_kwh !== null
                ? t(
                    `Est. cost: $${(primarySummary.observed_energy_kwh * rate).toFixed(2)}`,
                  )
                : t("Across selected interval")}
            </span>
          </div>

          {/* Card 3: Peak Load */}
          <div
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Peak Load
              </span>
              <TrendingUp size={16} style={{ color: "var(--warning-text)" }} />
            </div>
            <strong
              style={{
                fontSize: "1.75rem",
                fontFamily: "var(--font-mono)",
                margin: "8px 0 4px 0",
              }}
            >
              {value(primarySummary.peak_power_w)}{" "}
              <small style={{ fontSize: "1rem" }}>W</small>
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {t(`Average: ${value(primarySummary.average_power_w)} W`)}
            </span>
          </div>

          {/* Card 4: Operating Runtime */}
          <div
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Active Time
              </span>
              <Clock size={16} style={{ color: "var(--text-muted)" }} />
            </div>
            <strong
              style={{
                fontSize: "1.35rem",
                fontFamily: "var(--font-mono)",
                margin: "8px 0 4px 0",
              }}
            >
              {t(durationLabel(primarySummary.relay_on_seconds))}
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {t(`Standby: ${durationLabel(primarySummary.standby_seconds)}`)}
            </span>
          </div>

          {/* Card 5: Highest Temperature */}
          <div
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Peak Temp
              </span>
              <Thermometer size={16} style={{ color: "#fb923c" }} />
            </div>
            <strong
              style={{
                fontSize: "1.75rem",
                fontFamily: "var(--font-mono)",
                margin: "8px 0 4px 0",
              }}
            >
              {value(primarySummary.max_temperature_c)}{" "}
              <small style={{ fontSize: "1rem" }}>°C</small>
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Thermal reading
            </span>
          </div>
        </div>
      )}

      {/* 3. INTERACTIVE POWER COMPARISON CHART */}
      <PowerComparisonChart series={series} from={range.from} to={range.to} />

      {/* If 2 outlets compared: show matched difference banner */}
      {delta && (
        <div
          className="notice info"
          style={{
            margin: "16px 0 24px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            <strong>Matched power difference (Outlet 1 minus Outlet 2):</strong>{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {delta.watts !== null
                ? `${delta.watts > 0 ? "+" : ""}${value(delta.watts)} W`
                : "—"}
            </span>
          </span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Calculated across {delta.buckets} matched time buckets
          </span>
        </div>
      )}

      {/* 4. CLEAN SUMMARY METRICS TABLE */}
      <section
        className="panel view-panel analysis-summary"
        style={{ marginBottom: "24px" }}
      >
        <div className="section-heading" style={{ marginBottom: "16px" }}>
          <div>
            <h3>Energy & Load Summary</h3>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Key statistics calculated from captured telemetry in the selected
              interval.
            </span>
          </div>
        </div>

        {!!series.length && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  {series.map((item, index) => (
                    <th
                      key={`${item.target.mac}:${item.target.channel}`}
                      className={`series-${index}`}
                    >
                      <bdi data-i18n="off" dir="auto">
                        {item.name}
                      </bdi>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Total observed energy",
                    (item: AnalysisSeries) =>
                      `${value(item.chart.summary.observed_energy_kwh, 3)} kWh`,
                  ],
                  [
                    "Average active load",
                    (item: AnalysisSeries) =>
                      `${value(item.chart.summary.average_power_w)} W`,
                  ],
                  [
                    "Peak demand",
                    (item: AnalysisSeries) =>
                      `${value(item.chart.summary.peak_power_w)} W`,
                  ],
                  [
                    "Minimum power",
                    (item: AnalysisSeries) =>
                      `${value(item.chart.summary.minimum_power_w)} W`,
                  ],
                  [
                    "Operating time (Relay ON)",
                    (item: AnalysisSeries) =>
                      durationLabel(item.chart.summary.relay_on_seconds),
                  ],
                  [
                    "Standby time (≤ 3 W)",
                    (item: AnalysisSeries) =>
                      durationLabel(item.chart.summary.standby_seconds),
                  ],
                  [
                    "Highest temperature",
                    (item: AnalysisSeries) =>
                      `${value(item.chart.summary.max_temperature_c)} °C`,
                  ],
                  ...(rate !== null
                    ? [
                        [
                          "Estimated cost",
                          (item: AnalysisSeries) =>
                            item.chart.summary.observed_energy_kwh === null
                              ? "—"
                              : (
                                  item.chart.summary.observed_energy_kwh * rate
                                ).toFixed(3),
                        ],
                      ]
                    : []),
                ].map(([label, render]) => (
                  <tr key={String(label)}>
                    <td>{String(label)}</td>
                    {series.map((item) => (
                      <td
                        className="mono nowrap"
                        key={`${item.target.mac}:${item.target.channel}`}
                      >
                        {(render as (item: AnalysisSeries) => string)(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!series.length && !loading && (
          <div
            className="chart-empty"
            style={{ margin: "20px 0", minHeight: 120 }}
          >
            Select an outlet with stored telemetry to analyze power data.
          </div>
        )}

        {/* Collapsible Technical / Diagnostic Stats */}
        <div
          style={{
            marginTop: "14px",
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "12px",
          }}
        >
          <button
            type="button"
            className="btn btn-subtle"
            style={{ fontSize: "0.825rem", padding: "4px 8px" }}
            onClick={() => setShowTechDetails(!showTechDetails)}
          >
            {showTechDetails
              ? "▲ Hide technical sampling diagnostics"
              : "▼ Show technical sampling diagnostics (packet counts, gaps, std dev)"}
          </button>

          {showTechDetails && (
            <div className="table-container" style={{ marginTop: "12px" }}>
              <table>
                <thead>
                  <tr>
                    <th>Diagnostic parameter</th>
                    {series.map((item, index) => (
                      <th
                        key={`${item.target.mac}:${item.target.channel}`}
                        className={`series-${index}`}
                      >
                        <bdi data-i18n="off" dir="auto">
                          {item.name}
                        </bdi>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Power standard deviation",
                      (item: AnalysisSeries) =>
                        `${value(item.chart.summary.power_stddev_w)} W`,
                    ],
                    [
                      "Interval sample coverage",
                      (item: AnalysisSeries) =>
                        `${durationLabel(item.chart.summary.observed_seconds)} · ${Math.min(
                          100,
                          (item.chart.summary.observed_seconds /
                            Math.max(1, range.to - range.from)) *
                            100,
                        ).toFixed(1)}%`,
                    ],
                    [
                      "Captured telemetry packets",
                      (item: AnalysisSeries) =>
                        String(item.chart.summary.record_count),
                    ],
                    [
                      "Captured relay switches",
                      (item: AnalysisSeries) =>
                        String(item.chart.summary.relay_changes),
                    ],
                    [
                      "Excluded gaps / counter resets",
                      (item: AnalysisSeries) =>
                        `${item.chart.summary.gap_intervals} / ${item.chart.summary.counter_resets}`,
                    ],
                  ].map(([label, render]) => (
                    <tr key={String(label)}>
                      <td>{String(label)}</td>
                      {series.map((item) => (
                        <td
                          className="mono nowrap"
                          key={`${item.target.mac}:${item.target.channel}`}
                        >
                          {(render as (item: AnalysisSeries) => string)(item)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 5. COLLAPSIBLE OUTLET BEHAVIOR MONITORING & RULES */}
      <section className="panel view-panel" style={{ marginTop: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <BellRing size={20} style={{ color: "var(--text-muted)" }} />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
                Outlet behavior alerts & automatic shutoff
              </h3>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {controller.data.monitors.length
                  ? `${controller.data.monitors.filter((rule) => rule.definition.enabled).length} active monitoring rule(s)`
                  : "Watch sustained power or temperature conditions and record alerts or auto-shutoff."}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-subtle"
            style={{
              fontSize: "0.825rem",
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowMonitorRules(!showMonitorRules)}
          >
            {showMonitorRules ? "▲ Hide rules" : "▼ Manage rules"}
          </button>
        </div>

        {showMonitorRules && (
          <div
            style={{
              marginTop: "18px",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "16px",
            }}
          >
            <MonitorRules
              devices={devices}
              controller={controller}
              commandBusy={commandBusy}
            />
          </div>
        )}
      </section>
    </>,
  );
}
