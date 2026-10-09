import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  deviceFresh,
  deviceStatus,
  outletFault,
  relayTargetsConfirmed,
  relativeTime,
  telemetryFresh,
  validIpv4,
  validSubnet,
} from "../src/status";
import { api, isTauri } from "../src/api";
import { OutletItem } from "../src/components/OutletItem";
import App from "../src/App";
import { DashboardView } from "../src/components/DashboardView";
import type { DeviceInfo, OutletState } from "../src/types";
const now = Math.floor(Date.now() / 1000);
function outlet(overrides: Partial<OutletState> = {}): OutletState {
  return {
    channel: 1,
    custom_name: "Pump control",
    icon: "plug",
    on: false,
    power_w: 0,
    estimated_current_a: 0,
    energy_kwh: 0,
    secondary_energy_kwh: 0,
    energy_budget_kwh: 0,
    temperature_c: 25,
    event_code: "00",
    event_desc: "Normal",
    overload_ok: true,
    overheat_ok: true,
    countdown_sec: 0,
    standby_threshold_w: 3,
    standby_cutoff_enabled: false,
    updated_at: now,
    telemetry_at: now,
    report_revision: 1,
    ...overrides,
  };
}
function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    mac: "001122334455",
    alias: "Test equipment",
    model: "lgutap",
    firmware: "test",
    ip: "192.0.2.1",
    port: 10086,
    online: true,
    connection_id: 1,
    first_seen: now,
    last_seen: now,
    notes: "",
    total_power_w: 0,
    total_current_a: 0,
    outlets: [1, 2, 3, 4].map((channel) => outlet({ channel })),
    ...overrides,
  };
}
describe("reported device status", () => {
  test("absent telemetry is unknown, even when relay confirmation is recent", () => {
    expect(telemetryFresh(outlet({ telemetry_at: 0, updated_at: now }))).toBe(
      false,
    );
    expect(
      deviceStatus(
        device({
          outlets: [1, 2, 3, 4].map((channel) =>
            outlet({ channel, telemetry_at: 0 }),
          ),
        }),
      ),
    ).toBe("Awaiting telemetry");
  });
  test("relay updates do not make stale measurements fresh", () => {
    expect(
      telemetryFresh(outlet({ telemetry_at: now - 31, updated_at: now })),
    ).toBe(false);
    expect(
      deviceStatus(
        device({
          outlets: [1, 2, 3, 4].map((channel) =>
            outlet({ channel, telemetry_at: now - 31 }),
          ),
        }),
      ),
    ).toBe("Stale telemetry");
  });
  test("offline devices never contribute live data", () => {
    expect(deviceFresh(device({ online: false }))).toBe(false);
    expect(deviceStatus(device({ online: false }))).toBe("Offline");
  });
  test("a complete four-channel response is required", () => {
    expect(deviceFresh(device())).toBe(true);
    expect(deviceFresh(device({ outlets: [outlet()] }))).toBe(false);
    expect(
      deviceFresh(
        device({ outlets: [outlet(), outlet(), outlet(), outlet()] }),
      ),
    ).toBe(false);
  });
  test("thermal, overload, surge, and unknown alarms inhibit power-on", () => {
    for (const value of [
      outlet({ overload_ok: false }),
      outlet({ overheat_ok: false }),
      outlet({ event_code: "03" }),
      outlet({ event_code: "08" }),
      outlet({ event_code: "FF" }),
    ])
      expect(outletFault(value)).toBe(true);
    expect(outletFault(outlet({ event_code: "04" }))).toBe(false);
    expect(
      deviceStatus(
        device({
          outlets: [
            outlet({ overload_ok: false }),
            ...device().outlets.slice(1),
          ],
        }),
      ),
    ).toBe("Protection trip");
  });
  test("a queued command or cached matching state is not device confirmation", () => {
    const target = {
      mac: "001122334455",
      channels: [1, 2, 3, 4],
      on: false,
      revisions: { 1: 1, 2: 1, 3: 1, 4: 1 },
    };
    expect(relayTargetsConfirmed([device()], [target])).toBe(false);
    expect(
      relayTargetsConfirmed(
        [
          device({
            outlets: device().outlets.map((o) => ({
              ...o,
              report_revision: 2,
            })),
          }),
        ],
        [target],
      ),
    ).toBe(true);
    expect(relayTargetsConfirmed([device({ online: false })], [target])).toBe(
      false,
    );
    expect(relayTargetsConfirmed([], [target])).toBe(false);
    expect(relayTargetsConfirmed([device()], [])).toBe(false);
  });
  test("partial bulk confirmation keeps the operation pending", () => {
    const target = {
      mac: "001122334455",
      channels: [1, 2, 3, 4],
      on: true,
      revisions: { 1: 1, 2: 1, 3: 1, 4: 1 },
    };
    expect(
      relayTargetsConfirmed(
        [
          device({
            outlets: device().outlets.map((o) => ({
              ...o,
              on: o.channel !== 4,
              report_revision: 2,
            })),
          }),
        ],
        [target],
      ),
    ).toBe(false);
  });
  test("unknown timestamps are never shown as current", () => {
    expect(relativeTime(0, now)).toBe("Not received");
    expect(relativeTime(now - 20, now)).toBe("20s ago");
  });
});
describe("hardware-only API", () => {
  test("browser mode cannot fabricate devices or operation success", async () => {
    expect(isTauri()).toBe(false);
    for (const call of [
      () => api.getDevices(),
      () => api.getRemovedDevices(),
      () => api.removeDevice("001122334455"),
      () => api.restoreDevice("001122334455"),
      () => api.rebootDevice("001122334455"),
      () => api.registerDevice("001122334455", "192.0.2.1", "Physical strip"),
      () => api.setOutletState("001122334455", 1, true),
      () => api.getNetworkInfo(),
      () => api.getActivityLogs(),
      () =>
        api.provisionDevice(
          "192.0.2.1",
          30300,
          "192.0.2.2",
          "ssid",
          "password",
        ),
    ]) {
      await expect(call()).rejects.toThrow("desktop application");
    }
  });
  test("browser event cleanup is safe", () => {
    expect(() => api.onEvent("relay-change", () => {})()).not.toThrow();
  });
});
describe("outlet control states", () => {
  const props = {
    online: true,
    controlsAvailable: true,
    pending: false,
    onToggle: () => {},
    onUpdateName: async () => true,
  };
  test("missing data never appears as zero or healthy", () => {
    const html = renderToStaticMarkup(
      <OutletItem
        {...props}
        outlet={outlet({ telemetry_at: 0, updated_at: 0 })}
      />,
    );
    expect(html).toContain("Unverified");
    expect(html).toContain("Unknown");
    expect(html).toContain("disabled");
  });
  test("pending commands preserve the reported relay state and disable switching", () => {
    const html = renderToStaticMarkup(
      <OutletItem {...props} pending outlet={outlet()} />,
    );
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Awaiting confirmation");
    expect(html).toContain("disabled");
  });
  test("offline readings are clearly historical", () => {
    const html = renderToStaticMarkup(
      <OutletItem {...props} online={false} outlet={outlet({ on: true })} />,
    );
    expect(html).toContain("last reported");
    expect(html).toContain("Device offline");
    expect(html).toContain("Unverified");
  });
  test("power-on is disabled for faults while power-off remains available", () => {
    const off = renderToStaticMarkup(
      <OutletItem {...props} outlet={outlet({ overload_ok: false })} />,
    );
    const on = renderToStaticMarkup(
      <OutletItem
        {...props}
        outlet={outlet({ on: true, overload_ok: false })}
      />,
    );
    expect(off).toContain(
      'role="switch" aria-checked="false" aria-label="Channel 1 power" disabled',
    );
    expect(on).not.toContain(
      'role="switch" aria-checked="true" aria-label="Channel 1 power" disabled',
    );
  });
  test("browser overview has no fabricated devices or simulator controls", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Desktop connection required");
    expect(html).toContain("Unverified");
    expect(html).not.toContain("Sim Mode");
    expect(html).not.toContain("D8AA59");
  });
});
describe("network input validation", () => {
  test("accepts IPv4 /24 and rejects malformed or unsupported subnets", () => {
    expect(validIpv4("192.168.1.255")).toBe(true);
    for (const input of [
      "256.1.1.1",
      "192.168.1",
      "192.168.1.1:80",
      "192.168.a.1",
    ])
      expect(validIpv4(input)).toBe(false);
    expect(validSubnet("192.168.1.5/24")).toBe(true);
    expect(validSubnet("192.168.1.0/16")).toBe(false);
    expect(validSubnet("192.168.1.0/24/24")).toBe(false);
  });
});

describe("strip lifecycle interface", () => {
  const base = {
    devices: [],
    removedDevices: [],
    operationError: "",
    selectedMac: "",
    loading: false,
    native: true,
    controlsAvailable: true,
    pending: {},
    onRemove: async () => true,
    onRestore: async () => true,
    onReboot: async () => true,
    onNavigate: () => {},
    onSelectMac: () => {},
    onToggleOutlet: () => {},
    onUpdateOutletName: async () => true,
    onUpdateStripAlias: async () => true,
    onAllOn: () => {},
    onAllOff: () => {},
    onRefreshTelemetry: () => {},
  };
  test("removed strips remain recoverable when the active register is empty", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        {...base}
        removedDevices={[
          {
            mac: "001122334455",
            alias: "Factory pump",
            ip: "192.0.2.1",
            removed_at: now,
          },
        ]}
      />,
    );
    expect(html).toContain("Removed strips");
    expect(html).toContain("Factory pump");
    expect(html).toContain("Add back");
  });
  test("offline strips can be removed but cannot be rebooted", () => {
    const html = renderToStaticMarkup(
      <DashboardView {...base} devices={[device({ online: false })]} />,
    );
    const buttons = [
      ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
    ];
    expect(
      buttons.find((button) => button[2].includes("Reboot strip"))?.[1],
    ).toContain("disabled");
    expect(
      buttons.find((button) => button[2].includes("Remove strip"))?.[1],
    ).not.toContain("disabled");
  });
});
