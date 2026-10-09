import { useState } from "react";
import { BellRing, Pencil, Plus, Trash2 } from "lucide-react";
import { api, isTauri } from "../api";
import { localize, displayName, localeTag, t } from "../i18n";
import type { AutomationController } from "../automation";
import type { DeviceInfo, MonitorDefinition, MonitorRule } from "../types";

export function MonitorRules({
  devices,
  controller,
  commandBusy,
}: {
  devices: DeviceInfo[];
  controller: AutomationController;
  commandBusy: boolean;
}) {
  const [definition, setDefinition] = useState<MonitorDefinition>({
    name: "",
    target: { mac: "", channel: 1 },
    metric: "power",
    comparison: "above",
    threshold: 100,
    duration_sec: 30,
    action: "alert",
    enabled: true,
  });
  const [id, setId] = useState<number | undefined>();
  const [error, setError] = useState("");
  const busy = controller.busy || commandBusy;
  const ready = isTauri() && controller.available && !busy;
  const change = (fields: Partial<MonitorDefinition>) =>
    setDefinition((current) => ({ ...current, ...fields }));
  const targetKey = definition.target.mac
    ? `${definition.target.mac}:${definition.target.channel}`
    : "";
  async function save() {
    if (
      !definition.name.trim() ||
      !definition.target.mac ||
      !Number.isFinite(definition.threshold) ||
      definition.threshold < 0 ||
      !Number.isInteger(definition.duration_sec) ||
      definition.duration_sec < 10 ||
      definition.duration_sec > 86400
    ) {
      setError(
        "Enter a name, target outlet, threshold, and duration of at least 10 seconds.",
      );
      return;
    }
    setError("");
    if (await controller.act(() => api.saveMonitorRule(definition, id))) {
      setId(undefined);
      change({ name: "" });
    }
  }
  function edit(rule: MonitorRule) {
    setId(rule.id);
    setDefinition(structuredClone(rule.definition));
    setError("");
  }
  return localize(
    <section className="panel view-panel monitor-panel">
      <div className="section-heading">
        <div>
          <h3>Behavior monitoring</h3>
          <span>Alerts and optional automatic shutoff</span>
        </div>
        <BellRing size={20} />
      </div>
      <p className="field-hint">
        Rules watch an outlet while it is on. A condition must persist across
        fresh telemetry reports. Gaps over 30 seconds reset the timer. Alerts
        are recorded in the activity log.
      </p>
      <div className="preset-buttons">
        <button
          className="btn btn-glass"
          disabled={busy}
          onClick={() => {
            setId(undefined);
            change({
              metric: "power",
              comparison: "below",
              threshold: 3,
              duration_sec: 120,
              action: "alert",
              name: "",
            });
          }}
        >
          Standby / charging complete
        </button>
        <button
          className="btn btn-glass"
          disabled={busy}
          onClick={() => {
            setId(undefined);
            change({
              metric: "power",
              comparison: "above",
              threshold: 1000,
              duration_sec: 30,
              action: "alert",
              name: "",
            });
          }}
        >
          High load
        </button>
        <button
          className="btn btn-glass"
          disabled={busy}
          onClick={() => {
            setId(undefined);
            change({
              metric: "temperature",
              comparison: "above",
              threshold: 60,
              duration_sec: 30,
              action: "alert",
              name: "",
            });
          }}
        >
          High temperature
        </button>
      </div>
      <fieldset disabled={busy} className="automation-fields">
        <div className="automation-form-grid">
          <label className="field-label">
            Rule name
            <input
              className="input-field"
              dir="auto"
              maxLength={80}
              value={definition.name}
              onChange={(event) => change({ name: event.target.value })}
            />
          </label>
          <label className="field-label">
            Target outlet
            <select
              className="input-field"
              value={targetKey}
              onChange={(event) => {
                const [mac, channel] = event.target.value.split(":");
                change({ target: { mac, channel: Number(channel) } });
              }}
            >
              <option value="">Select an outlet</option>
              {devices.flatMap((device) =>
                [1, 2, 3, 4].map((channel) => (
                  <option
                    data-i18n="off"
                    key={`${device.mac}:${channel}`}
                    value={`${device.mac}:${channel}`}
                  >
                    {displayName(device.alias)} · CH {channel} ·{" "}
                    {displayName(
                      device.outlets.find(
                        (outlet) => outlet.channel === channel,
                      )?.custom_name || `Outlet ${channel}`,
                    )}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>
        <div className="monitor-fields">
          <label className="field-label">
            Metric
            <select
              className="input-field"
              value={definition.metric}
              onChange={(event) =>
                change({
                  metric: event.target.value as MonitorDefinition["metric"],
                  threshold: event.target.value === "power" ? 100 : 60,
                })
              }
            >
              <option value="power">Power (W)</option>
              <option value="temperature">Temperature (°C)</option>
            </select>
          </label>
          <label className="field-label">
            Condition
            <select
              className="input-field"
              value={definition.comparison}
              onChange={(event) =>
                change({
                  comparison: event.target
                    .value as MonitorDefinition["comparison"],
                })
              }
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </label>
          <label className="field-label">
            Threshold
            <input
              className="input-field"
              type="number"
              min={0}
              max={definition.metric === "power" ? 10000 : 150}
              value={definition.threshold}
              onChange={(event) =>
                change({ threshold: Number(event.target.value) })
              }
            />
          </label>
          <label className="field-label">
            Sustained seconds
            <input
              className="input-field"
              type="number"
              min={10}
              max={86400}
              step={1}
              value={definition.duration_sec}
              onChange={(event) =>
                change({ duration_sec: Number(event.target.value) })
              }
            />
          </label>
          <label className="field-label">
            When triggered
            <select
              className="input-field"
              value={definition.action}
              onChange={(event) =>
                change({
                  action: event.target.value as MonitorDefinition["action"],
                })
              }
            >
              <option value="alert">Record an alert</option>
              <option value="off">Alert and switch off</option>
            </select>
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={definition.enabled}
            onChange={(event) => change({ enabled: event.target.checked })}
          />
          Enabled
        </label>
      </fieldset>
      {definition.action === "off" && (
        <div className="notice info">
          A shutoff pauses automation on that strip, sends an off command, and
          waits for confirmation. The rule disables after triggering. Inspect
          the equipment before re-enabling it.
        </div>
      )}
      <p className="field-hint">
        Telemetry arrives roughly every 10 seconds. Short pulses and startup
        transients may fall between reports.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="panel-actions">
        <button
          className="btn btn-primary"
          disabled={!ready || !devices.length}
          onClick={() => void save()}
        >
          <Plus size={16} />
          {id ? "Save changes" : "Save monitoring rule"}
        </button>
        {id && (
          <button
            className="btn btn-glass"
            onClick={() => {
              setId(undefined);
              change({ name: "" });
            }}
          >
            Cancel edit
          </button>
        )}
      </div>
      <div className="monitor-list">
        {controller.data.monitors.length ? (
          controller.data.monitors.map((rule) => (
            <article className="automation-card" key={rule.id}>
              <div className="section-heading">
                <h3>
                  <bdi data-i18n="off" dir="auto">
                    {rule.definition.name}
                  </bdi>
                </h3>
                <span className="meta-chip">{t(rule.status)}</span>
              </div>
              <p>
                <bdi data-i18n="off" dir="auto">
                  {displayName(
                    devices.find(
                      (device) => device.mac === rule.definition.target.mac,
                    )?.alias || rule.definition.target.mac,
                  )}
                </bdi>{" "}
                · CH {rule.definition.target.channel} ·{" "}
                {t(rule.definition.comparison === "above" ? "Above" : "Below")}{" "}
                {rule.definition.threshold}{" "}
                {rule.definition.metric === "power" ? "W" : "°C"} ·{" "}
                {rule.definition.duration_sec} s ·{" "}
                {t(
                  rule.definition.action === "off"
                    ? "Alert and switch off"
                    : "Record an alert",
                )}
              </p>
              <p className="field-hint">
                {t("Last trigger")} ·{" "}
                {rule.last_triggered_at
                  ? new Date(rule.last_triggered_at * 1000).toLocaleString(
                      localeTag(),
                    )
                  : "—"}
              </p>
              {rule.message && <p className="field-hint">{rule.message}</p>}
              <div className="panel-actions">
                <button
                  className="btn btn-glass"
                  disabled={!ready || rule.status === "switching_off"}
                  onClick={() =>
                    void controller.act(() =>
                      api.saveMonitorRule(
                        {
                          ...rule.definition,
                          enabled: !rule.definition.enabled,
                        },
                        rule.id,
                      ),
                    )
                  }
                >
                  {rule.definition.enabled ? "Disable rule" : "Enable rule"}
                </button>
                <button
                  className="btn btn-glass icon-button"
                  aria-label="Edit monitoring rule"
                  disabled={busy || rule.status === "switching_off"}
                  onClick={() => edit(rule)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="btn btn-glass icon-button"
                  aria-label="Delete monitoring rule"
                  disabled={!ready || rule.status === "switching_off"}
                  onClick={() =>
                    void controller.act(() =>
                      api.deleteAutomation("monitor", rule.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="field-hint">No monitoring rules saved.</p>
        )}
      </div>
    </section>,
  );
}
