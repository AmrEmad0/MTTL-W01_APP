import { useState } from "react";
import {
  CalendarClock,
  Plus,
  Play,
  Square,
  Trash2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { api, isTauri } from "../api";
import { displayName, localize, localeTag, t } from "../i18n";
import { localDateInput } from "../history";
import {
  durationLabel,
  scenarioHoldSeconds,
  validateScenario,
  type AutomationController,
} from "../automation";
import type {
  AutomationPlan,
  DeviceInfo,
  PlanDefinition,
  ScheduleTrigger,
} from "../types";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const defaults = (): PlanDefinition => ({
  name: "",
  targets: [],
  steps: [
    { on: true, duration_sec: 3 },
    { on: false, duration_sec: 10 },
  ],
  repetitions: 10,
  trigger: { kind: "manual" },
  enabled: true,
});
const date = (at: number | null) =>
  at ? new Date(at * 1000).toLocaleString(localeTag()) : "—";
export function AutomationView({
  devices,
  controller,
  controlsAvailable,
  commandBusy,
}: {
  devices: DeviceInfo[];
  controller: AutomationController;
  controlsAvailable: boolean;
  commandBusy: boolean;
}) {
  const [draft, setDraft] = useState<PlanDefinition>(defaults);
  const [editing, setEditing] = useState<number | undefined>();
  const [formError, setFormError] = useState("");
  const [startTime, setStartTime] = useState(
    localDateInput(Math.floor(Date.now() / 1000) + 3600),
  );
  const native = isTauri(),
    busy = controller.busy || commandBusy;
  const ready = native && controller.available && !busy;
  const change = (fields: Partial<PlanDefinition>) =>
    setDraft((current) => ({ ...current, ...fields }));
  const selected = (mac: string, channel: number) =>
    draft.targets.some(
      (target) => target.mac === mac && target.channel === channel,
    );
  const toggle = (mac: string, channel: number) =>
    change({
      targets: selected(mac, channel)
        ? draft.targets.filter(
            (target) => target.mac !== mac || target.channel !== channel,
          )
        : [...draft.targets, { mac, channel }],
    });
  function edit(plan: AutomationPlan) {
    setEditing(plan.id);
    setDraft(structuredClone(plan.definition));
    setFormError("");
    if (plan.definition.trigger.kind === "once")
      setStartTime(localDateInput(plan.definition.trigger.at));
  }
  function preset(kind: string) {
    setEditing(undefined);
    setFormError("");
    const base = defaults();
    base.targets = draft.targets;
    if (kind === "switch") {
      base.steps = [{ on: true, duration_sec: 0 }];
      base.repetitions = 1;
      base.trigger = {
        kind: "weekly",
        time: "08:00",
        weekdays: [1, 2, 3, 4, 5],
      };
    }
    if (kind === "reboot") {
      base.steps = [
        { on: false, duration_sec: 10 },
        { on: true, duration_sec: 30 },
      ];
      base.repetitions = 1;
    }
    if (kind === "endurance") {
      base.steps = [
        { on: true, duration_sec: 60 },
        { on: false, duration_sec: 60 },
      ];
      base.repetitions = 100;
    }
    if (kind === "timer") {
      base.steps = [
        { on: true, duration_sec: 900 },
        { on: false, duration_sec: 1 },
      ];
      base.repetitions = 1;
    }
    setDraft(base);
  }
  function trigger(kind: ScheduleTrigger["kind"]) {
    change({
      trigger:
        kind === "manual"
          ? { kind }
          : kind === "once"
            ? { kind, at: Math.floor(new Date(startTime).getTime() / 1000) }
            : { kind, time: "08:00", weekdays: [1, 2, 3, 4, 5] },
    });
  }
  async function save() {
    const error = validateScenario(draft);
    setFormError(error);
    if (error) return;
    if (await controller.act(() => api.saveAutomationPlan(draft, editing))) {
      setEditing(undefined);
      setDraft(defaults());
    }
  }
  const running = controller.data.plans.filter(
    (plan) => plan.status === "running",
  );
  return localize(
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AUTOMATION</span>
          <h2>Schedules & scenarios</h2>
          <p>Schedule outlet states and run repeatable equipment tests.</p>
        </div>
        <button
          className="btn btn-danger"
          disabled={
            !ready ||
            !(
              controller.data.plans.some(
                (plan) => plan.definition.enabled || plan.status === "running",
              ) ||
              controller.data.monitors.some((rule) => rule.definition.enabled)
            )
          }
          onClick={() => void controller.act(api.stopAllAutomation)}
        >
          <Square size={16} />
          Stop all automation
        </button>
      </div>
      <div className="notice info">
        <CalendarClock size={19} />
        <span>
          Schedules run while this desktop controller is open and awake. Times
          use this computer’s local timezone. Missed starts are skipped;
          interrupted runs are not resumed.
        </span>
      </div>
      {controller.error && (
        <div className="notice error" role="alert">
          {controller.error}
        </div>
      )}
      <div className="automation-layout">
        <section className="panel view-panel scenario-builder">
          <div className="section-heading">
            <div>
              <h3>{editing ? "Edit automation" : "Build an automation"}</h3>
              <span>One outlet or a coordinated group</span>
            </div>
            {editing && (
              <button
                className="btn btn-glass"
                onClick={() => {
                  setEditing(undefined);
                  setDraft(defaults());
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
          <div className="preset-buttons" aria-label="Scenario templates">
            <button className="btn btn-glass" onClick={() => preset("switch")}>
              Scheduled switch
            </button>
            <button className="btn btn-glass" onClick={() => preset("cycle")}>
              3 s on / 10 s off
            </button>
            <button className="btn btn-glass" onClick={() => preset("reboot")}>
              Power cycle
            </button>
            <button className="btn btn-glass" onClick={() => preset("timer")}>
              Auto-off timer
            </button>
            <button
              className="btn btn-glass"
              onClick={() => preset("endurance")}
            >
              Endurance test
            </button>
          </div>
          <fieldset disabled={busy} className="automation-fields">
            <label className="field-label">
              Automation name
              <input
                className="input-field"
                dir="auto"
                maxLength={80}
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
                placeholder="Name this schedule or test"
              />
            </label>
            <fieldset className="target-picker">
              <legend>Target outlets</legend>
              {!devices.length && (
                <p className="field-hint">
                  Add a physical strip to select outlets.
                </p>
              )}
              {devices.map((device) => (
                <div className="target-device" key={device.mac}>
                  <div>
                    <bdi data-i18n="off" dir="auto">
                      {displayName(device.alias)}
                    </bdi>
                    <span className="meta-chip">
                      {device.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="target-checkboxes">
                    {[1, 2, 3, 4].map((channel) => (
                      <label key={channel}>
                        <input
                          type="checkbox"
                          checked={selected(device.mac, channel)}
                          onChange={() => toggle(device.mac, channel)}
                        />
                        <span>
                          CH {channel} ·{" "}
                          <bdi data-i18n="off" dir="auto">
                            {displayName(
                              device.outlets.find(
                                (outlet) => outlet.channel === channel,
                              )?.custom_name || `Outlet ${channel}`,
                            )}
                          </bdi>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            <div className="section-heading">
              <h3>Scenario steps</h3>
              <span>Apply state, confirm, then hold</span>
            </div>
            <div className="scenario-steps">
              {draft.steps.map((step, index) => (
                <div className="scenario-step" key={index}>
                  <span className="step-number">{index + 1}</span>
                  <label className="field-label">
                    Outlet state
                    <select
                      className="input-field"
                      value={step.on ? "on" : "off"}
                      onChange={(event) =>
                        change({
                          steps: draft.steps.map((s, i) =>
                            i === index
                              ? { ...s, on: event.target.value === "on" }
                              : s,
                          ),
                        })
                      }
                    >
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Hold seconds
                    <input
                      className="input-field"
                      type="number"
                      min={
                        draft.steps.length === 1 && draft.repetitions === 1
                          ? 0
                          : 1
                      }
                      max={86400}
                      step={1}
                      value={step.duration_sec}
                      onChange={(event) =>
                        change({
                          steps: draft.steps.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  duration_sec: Number(event.target.value),
                                }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="btn btn-glass icon-button"
                    aria-label="Remove step"
                    disabled={draft.steps.length === 1}
                    onClick={() =>
                      change({
                        steps: draft.steps.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-glass"
              disabled={draft.steps.length >= 32}
              onClick={() =>
                change({
                  steps: [
                    ...draft.steps.map((step) => ({
                      ...step,
                      duration_sec: Math.max(1, step.duration_sec),
                    })),
                    {
                      on: !draft.steps[draft.steps.length - 1].on,
                      duration_sec: 10,
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              Add step
            </button>
            <div className="automation-form-grid">
              <label className="field-label">
                Repeat cycles
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  value={draft.repetitions}
                  onChange={(event) =>
                    change({ repetitions: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-label">
                Start mode
                <select
                  className="input-field"
                  value={draft.trigger.kind}
                  onChange={(event) =>
                    trigger(event.target.value as ScheduleTrigger["kind"])
                  }
                >
                  <option value="manual">Run manually</option>
                  <option value="once">Once at a date and time</option>
                  <option value="weekly">Repeat on selected weekdays</option>
                </select>
              </label>
            </div>
            {draft.trigger.kind === "once" && (
              <label className="field-label">
                Start at (local time)
                <input
                  className="input-field"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => {
                    setStartTime(event.target.value);
                    change({
                      trigger: {
                        kind: "once",
                        at: Math.floor(
                          new Date(event.target.value).getTime() / 1000,
                        ),
                      },
                    });
                  }}
                />
              </label>
            )}
            {draft.trigger.kind === "weekly" && (
              <>
                <label className="field-label">
                  Local start time
                  <input
                    className="input-field"
                    type="time"
                    value={draft.trigger.time}
                    onChange={(event) => {
                      if (draft.trigger.kind === "weekly")
                        change({
                          trigger: {
                            ...draft.trigger,
                            time: event.target.value,
                          },
                        });
                    }}
                  />
                </label>
                <div className="weekday-picker">
                  {days.map((day, index) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={
                          draft.trigger.kind === "weekly" &&
                          draft.trigger.weekdays.includes(index + 1)
                        }
                        onChange={() => {
                          if (draft.trigger.kind === "weekly")
                            change({
                              trigger: {
                                ...draft.trigger,
                                weekdays: draft.trigger.weekdays.includes(
                                  index + 1,
                                )
                                  ? draft.trigger.weekdays.filter(
                                      (value) => value !== index + 1,
                                    )
                                  : [...draft.trigger.weekdays, index + 1],
                              },
                            });
                        }}
                      />
                      <span>{day}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => change({ enabled: event.target.checked })}
              />
              Enabled
            </label>
          </fieldset>
          <div className="scenario-preview" dir="ltr">
            <div>
              {draft.steps.map((step, index) => (
                <span
                  key={index}
                  className={`scenario-phase ${step.on ? "on" : "off"}`}
                >
                  <strong>{t(step.on ? "On" : "Off")}</strong>
                  <small>{durationLabel(step.duration_sec)}</small>
                </span>
              ))}
            </div>
            <p>
              {t("Planned hold time")} ·{" "}
              {durationLabel(scenarioHoldSeconds(draft))} · {draft.repetitions}{" "}
              ×
            </p>
          </div>
          <p className="field-hint">
            Hold time starts after relay confirmation. Switching and
            confirmation add time. A single step with zero hold sends one
            scheduled action. The final step determines the final outlet state.
          </p>
          {(formError ||
            draft.targets.some(
              (target) => !devices.some((device) => device.mac === target.mac),
            )) && (
            <div className="notice error" role="alert">
              {formError ||
                "One of the selected strips is removed or unregistered"}
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={!ready || !devices.length}
            onClick={() => void save()}
          >
            <Plus size={17} />
            {editing ? "Save changes" : "Save automation"}
          </button>
        </section>
        <section className="panel view-panel automation-list">
          <div className="section-heading">
            <div>
              <h3>Saved automations</h3>
              <span>
                {running.length} {t("running")}
              </span>
            </div>
            <button
              className="btn btn-glass"
              disabled={busy || !native}
              aria-label="Refresh automation"
              onClick={() => void controller.act(controller.reload)}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          {!controller.data.plans.length && (
            <div className="empty-state">
              <CalendarClock size={32} />
              <h3>No saved automations</h3>
              <p>
                Create a scheduled switch or a repeatable scenario. Hardware
                actions require the desktop application.
              </p>
            </div>
          )}
          {controller.data.plans.map((plan) => (
            <article className="automation-card" key={plan.id}>
              <div className="section-heading">
                <h3>
                  <bdi data-i18n="off" dir="auto">
                    {plan.definition.name}
                  </bdi>
                </h3>
                <span
                  className={`meta-chip ${plan.status === "failed" ? "status-error" : ""}`}
                >
                  {t(plan.status)}
                </span>
              </div>
              <p>
                {plan.definition.targets.length} {t("outlets")} ·{" "}
                {plan.definition.repetitions} {t("cycles")} ·{" "}
                {durationLabel(scenarioHoldSeconds(plan.definition))}
              </p>
              <div className="automation-target-summary">
                {plan.definition.targets.map((target) => (
                  <span key={`${target.mac}:${target.channel}`}>
                    <bdi data-i18n="off" dir="auto">
                      {displayName(
                        devices.find((device) => device.mac === target.mac)
                          ?.alias || target.mac,
                      )}
                    </bdi>{" "}
                    · CH {target.channel}
                  </span>
                ))}
              </div>
              <dl className="automation-details">
                <div>
                  <dt>Next start</dt>
                  <dd>{date(plan.next_run_at)}</dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>
                    {plan.definition.trigger.kind === "manual"
                      ? t("Manual")
                      : plan.definition.trigger.kind === "once"
                        ? date(plan.definition.trigger.at)
                        : `${plan.definition.trigger.time} · ${plan.definition.trigger.weekdays.map((day) => t(days[day - 1])).join(" · ")}`}
                  </dd>
                </div>
                <div>
                  <dt>Progress</dt>
                  <dd>
                    {plan.completed_cycles} / {plan.definition.repetitions} ·{" "}
                    {t("Step")} {plan.current_step + 1} /{" "}
                    {plan.definition.steps.length}
                  </dd>
                </div>
                <div>
                  <dt>Last start</dt>
                  <dd>{date(plan.started_at)}</dd>
                </div>
              </dl>
              {plan.message && <p className="field-hint">{plan.message}</p>}
              <div className="panel-actions">
                <button
                  className="btn btn-primary"
                  disabled={
                    !ready || !controlsAvailable || plan.status === "running"
                  }
                  onClick={() =>
                    void controller.act(() => api.runAutomationPlan(plan.id))
                  }
                >
                  <Play size={15} />
                  Run now
                </button>
                <button
                  className="btn btn-glass"
                  disabled={
                    !ready ||
                    !(plan.definition.enabled || plan.status === "running")
                  }
                  onClick={() =>
                    void controller.act(() => api.stopAutomationPlan(plan.id))
                  }
                >
                  <Square size={15} />
                  Stop / disable
                </button>
                {!plan.definition.enabled &&
                  plan.definition.trigger.kind !== "manual" && (
                    <button
                      className="btn btn-glass"
                      disabled={
                        !ready ||
                        (plan.definition.trigger.kind === "once" &&
                          plan.definition.trigger.at <= Date.now() / 1000)
                      }
                      onClick={() =>
                        void controller.act(() =>
                          api.saveAutomationPlan(
                            { ...plan.definition, enabled: true },
                            plan.id,
                          ),
                        )
                      }
                    >
                      Enable schedule
                    </button>
                  )}
                <button
                  className="btn btn-glass icon-button"
                  aria-label="Edit automation"
                  disabled={busy || plan.status === "running"}
                  onClick={() => edit(plan)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="btn btn-glass icon-button"
                  aria-label="Delete automation"
                  disabled={!ready || plan.status === "running"}
                  onClick={() =>
                    void controller.act(() =>
                      api.deleteAutomation("plan", plan.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          <p className="field-hint">
            Stopping a run pauses its schedule and leaves outlets in their last
            reported state. All strips off pauses schedules before switching the
            outlets off.
          </p>
        </section>
      </div>
    </>,
  );
}
