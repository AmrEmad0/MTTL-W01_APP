import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { chartSegments, historyCsv } from "../src/history";
import { UsageChart } from "../src/components/UsageChart";
import { HistoryView } from "../src/components/HistoryView";
import { DataManagementView } from "../src/components/DataManagementView";
import { api } from "../src/api";
import type { HistoryPoint, TelemetryRecord } from "../src/types";
const point = (timestamp: number, power: number | null): HistoryPoint => ({
  timestamp,
  average_power_w: power,
  peak_power_w: power,
  temperature_c: 25,
  energy_kwh: 0,
  samples: 1,
});
describe("recorded usage charts", () => {
  test("missing samples and time gaps split the line instead of inventing readings", () => {
    const data = [
      point(1000, 10),
      point(1010, 20),
      point(1020, null),
      point(1030, 30),
      point(1100, 40),
    ];
    expect(
      chartSegments(data, "average_power_w", 10).map((segment) =>
        segment.map((item) => item.timestamp),
      ),
    ).toEqual([[1000, 1010], [1030], [1100]]);
  });
  test("real zero readings are plotted and missing counters are not shown as zero", () => {
    const zero = renderToStaticMarkup(
      <UsageChart
        title="Active power"
        unit="W"
        metric="average_power_w"
        points={[point(1000, 0)]}
        bucketSeconds={10}
        from={1000}
        to={1020}
      />,
    );
    expect(zero).toContain("0.0 W");
    expect(zero).toContain('type="range"');
    const missing = renderToStaticMarkup(
      <UsageChart
        title="Electricity usage"
        unit="kWh"
        metric="energy_kwh"
        points={[{ ...point(1000, 10), energy_kwh: null }]}
        bucketSeconds={10}
        from={1000}
        to={1020}
      />,
    );
    expect(missing).toContain("At least two counter readings");
    expect(missing).not.toContain("0.000 kWh");
  });
  test("CSV preserves counters and missing legacy fields", () => {
    const csv = historyCsv([
      {
        id: 1,
        mac: "001122334455",
        channel: 1,
        recorded_at: 1000,
        relay_on: false,
        power_w: 0,
        energy_kwh: 1.25,
        secondary_energy_kwh: 0,
        temperature_c: 25,
        event_code: "00",
        energy_budget_kwh: null,
        overload_ok: null,
        overheat_ok: null,
        countdown_sec: null,
        standby_threshold_w: null,
        standby_cutoff_enabled: null,
      } as TelemetryRecord,
    ]);
    expect(csv).toContain('"1.25"');
    expect(csv).toContain('"false"');
    expect(csv).toContain(',"",');
    expect(csv).toContain("overload_ok");
  });
  test("history without device access never fabricates measurements", () => {
    const html = renderToStaticMarkup(
      <HistoryView
        initialMac=""
        busy={false}
        operationError=""
        onRenameStrip={async () => true}
        onRenameOutlet={async () => true}
        onManageData={() => {}}
      />,
    );
    expect(html).toContain("Usage &amp; history");
    expect(html).toContain("No sample data is generated");
    expect(html).toContain("Rename selected outlet");
    expect(html).not.toContain("0.000");
  });
  test("clearing controls keep exclusions separate from a full reset", () => {
    const html = renderToStaticMarkup(
      <DataManagementView
        busy={false}
        operationError=""
        onClear={async () => true}
      />,
    );
    expect(html).toContain("MACs stay excluded");
    expect(html).toContain("Reset entire database");
    expect(html).toContain("Outlet (telemetry clearing only)");
    expect(html).toContain("disabled");
  });
  test("history and deletion require the native database", async () => {
    for (const action of [
      () => api.getHistoryDevices(),
      () => api.getDataStats(),
      () => api.getHistoryChart("001122334455", undefined, 1000, 2000),
      () => api.getHistoryPage("001122334455", 1, 1000, 2000),
      () => api.clearData("database"),
    ])
      await expect(action()).rejects.toThrow("desktop application");
  });
});
