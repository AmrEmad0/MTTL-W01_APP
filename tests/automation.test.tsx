import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  scenarioHoldSeconds,
  validateScenario,
  type AutomationController,
} from "../src/automation";
import { analysisCsv, pairedPowerDifference } from "../src/analyzer";
import { api } from "../src/api";
import { setLanguage } from "../src/i18n";
import { AutomationView } from "../src/components/AutomationView";
import { PowerAnalyzerView } from "../src/components/PowerAnalyzerView";
import { PowerComparisonChart } from "../src/components/PowerComparisonChart";
import type { HistoryChart, HistoryPoint, PlanDefinition } from "../src/types";

const controller: AutomationController = {
  data: { plans: [], monitors: [] },
  error: "",
  busy: false,
  available: false,
  reload: async () => {},
  act: async () => false,
};
const draft = (): PlanDefinition => ({
  name: "Equipment cycle",
  targets: [{ mac: "001122334455", channel: 1 }],
  steps: [
    { on: true, duration_sec: 3 },
    { on: false, duration_sec: 10 },
  ],
  repetitions: 10,
  trigger: { kind: "manual" },
  enabled: true,
});
const point = (timestamp: number, power: number | null): HistoryPoint => ({
  timestamp,
  average_power_w: power,
  peak_power_w: power,
  temperature_c: 25,
  energy_kwh: null,
  samples: 1,
});
const chart = (points: HistoryPoint[]): HistoryChart => ({
  bucket_seconds: 10,
  summary: {} as HistoryChart["summary"],
  outlets: [],
  points,
});
afterEach(() => setLanguage("en"));

describe("automation and analysis", () => {
  test("3s on and 10s off has bounded cycles and a reviewable total", () => {
    const definition = draft();
    expect(scenarioHoldSeconds(definition)).toBe(130);
    expect(validateScenario(definition)).toBe("");
    definition.repetitions = 0;
    expect(validateScenario(definition)).not.toBe("");
    definition.repetitions = 1;
    definition.steps[0].duration_sec = 0;
    expect(validateScenario(definition)).not.toBe("");
    definition.steps = [{ on: false, duration_sec: 0 }];
    expect(validateScenario(definition)).toBe("");
  });
  test("scheduled starts reject past dates and missing weekdays", () => {
    const definition = draft();
    definition.trigger = { kind: "once", at: 1 };
    expect(validateScenario(definition)).toBe("Choose a future start time");
    definition.trigger = { kind: "weekly", time: "08:00", weekdays: [] };
    expect(validateScenario(definition)).toBe(
      "Choose a local time and at least one weekday",
    );
    definition.trigger = { kind: "weekly", time: "25:00", weekdays: [1] };
    expect(validateScenario(definition)).not.toBe("");
  });
  test("comparisons use only simultaneous recorded buckets including real zeros", () => {
    const a = chart([
      point(1000, 0),
      point(1010, 30),
      point(1020, null),
      point(1030, 100),
    ]);
    const b = chart([
      point(1000, 10),
      point(1010, 10),
      point(1020, 80),
      point(1040, 999),
    ]);
    expect(pairedPowerDifference(a, b)).toEqual({ watts: 5, buckets: 2 });
    expect(pairedPowerDifference(chart([]), b)).toEqual({
      watts: null,
      buckets: 0,
    });
  });
  test("CSV exports all real buckets, leaves missing energy empty, and neutralizes formula names", () => {
    const csv = analysisCsv([
      {
        name: '=HYPERLINK("example")',
        target: { mac: "001122334455", channel: 2 },
        chart: chart([point(1000, 0), point(1010, null)]),
      },
    ]);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"\'=HYPERLINK(""example"")"');
    expect(csv).toContain('"1000","10","0","0","","25","1"');
  });
  test("browser screens do not fabricate saved rules or enable hardware actions", () => {
    const automation = renderToStaticMarkup(
      <AutomationView
        devices={[]}
        controller={controller}
        controlsAvailable={false}
        commandBusy={false}
      />,
    );
    expect(automation).toContain("No saved automations");
    expect(automation).toContain("3 s on / 10 s off");
    expect(automation).toMatch(
      /disabled=""[^>]*>[^<]*<svg[^]*?Save automation/,
    );
    const analyzer = renderToStaticMarkup(
      <PowerAnalyzerView
        devices={[]}
        initialMac=""
        controller={controller}
        commandBusy={false}
      />,
    );
    expect(analyzer).toContain("No sample data is generated");
    expect(analyzer).toContain(
      "Outlet behavior alerts &amp; automatic shutoff",
    );
    expect(analyzer).not.toContain("0.000 kWh");
    expect(analyzer).toContain("Manage rules");
  });
  test("Arabic translates new controls and preserves chart identities", () => {
    setLanguage("ar");
    const automation = renderToStaticMarkup(
      <AutomationView
        devices={[]}
        controller={controller}
        controlsAvailable={false}
        commandBusy={false}
      />,
    );
    expect(automation).toContain("الجداول والسيناريوهات");
    expect(automation).not.toContain("Save automation");
    const analyzer = renderToStaticMarkup(
      <PowerAnalyzerView
        devices={[]}
        initialMac=""
        controller={controller}
        commandBusy={false}
      />,
    );
    expect(analyzer).toContain("محلّل القدرة");
    expect(analyzer).not.toContain("Save monitoring rule");
    const comparison = renderToStaticMarkup(
      <PowerComparisonChart
        from={1000}
        to={1020}
        series={[
          {
            name: "Online bench",
            target: { mac: "001122334455", channel: 1 },
            chart: chart([point(1000, 42)]),
          },
        ]}
      />,
    );
    expect(comparison).toContain("Online bench");
    expect(comparison).toContain('aria-label="مخطط مقارنة القدرة"');
  });
  test("automation and monitoring APIs require real desktop access", async () => {
    for (const action of [
      () => api.getAutomation(),
      () => api.saveAutomationPlan(draft()),
      () => api.runAutomationPlan(1),
      () => api.stopAutomationPlan(1),
      () => api.stopAllAutomation(),
      () => api.deleteAutomation("monitor", 1),
      () =>
        api.saveMonitorRule({
          name: "Standby",
          target: { mac: "001122334455", channel: 1 },
          metric: "power",
          comparison: "below",
          threshold: 3,
          duration_sec: 10,
          action: "off",
          enabled: true,
        }),
    ])
      await expect(action()).rejects.toThrow("desktop application");
  });
});
