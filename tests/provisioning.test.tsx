import { describe, expect, test } from "bun:test";
import {
  canonicalMac,
  matchHostDevice,
  mergeTargets,
  runtimeCandidates,
  settingsApplied,
} from "../src/provisioning";
import { initialTheme } from "../src/theme";
import type { DeviceInfo, NetworkHost, ProvisionTarget } from "../src/types";
const target = (overrides: Partial<ProvisionTarget> = {}): ProvisionTarget => ({
  id: "1",
  mode: "auto",
  name: "TONLY_TAP_123456",
  ssid: "TONLY_TAP_123456",
  bssid: "11:22:33:44:55:66",
  ip: "192.168.1.1",
  port: 30300,
  ...overrides,
});
const device = (overrides: Partial<DeviceInfo> = {}): DeviceInfo =>
  ({
    mac: "001122334455",
    online: true,
    connection_id: 2,
    outlets: [1, 2, 3, 4].map((channel) => ({
      channel,
      telemetry_at: Date.now() / 1000,
    })),
    ...overrides,
  }) as DeviceInfo;
describe("multiple physical device discovery", () => {
  test("normalizes MACs and rejects placeholder/invalid identities", () => {
    expect(canonicalMac("aa:bb:cc:dd:ee:ff")).toBe("AABBCCDDEEFF");
    for (const value of [
      "",
      "000000000000",
      "FFFFFFFFFFFF",
      "GG1122334455",
      "112233",
    ])
      expect(canonicalMac(value)).toBe("");
  });
  test("never associates a discovered host by a reused IP", () => {
    const saved = [{ mac: "001122334455", ip: "192.168.1.4" }];
    const host = { ip: "192.168.1.4", mac: "11:22:33:44:55:66" } as NetworkHost;
    expect(matchHostDevice(host, saved)).toBeUndefined();
    expect(
      matchHostDevice({ ...host, mac: "00:11:22:33:44:55" }, saved),
    ).toEqual(saved[0]);
    expect(matchHostDevice({ ...host, mac: undefined }, saved)).toBeUndefined();
  });
  test("deduplicates rescans but retains distinct BSSIDs sharing one SSID", () => {
    const first = target();
    const other = target({ id: "2", bssid: "11:22:33:44:55:77" });
    expect(mergeTargets([first], [first, other])).toHaveLength(2);
    const known = target({ mac: "001122334455" });
    expect(
      mergeTargets(
        [known],
        [target({ id: "2", bssid: "other", mac: "00:11:22:33:44:55" })],
      ),
    ).toHaveLength(1);
    expect(
      mergeTargets(
        [],
        [
          target({ mode: "manual", ip: "192.0.2.1" }),
          target({ id: "2", mode: "manual", ip: "192.0.2.2" }),
        ],
      ),
    ).toHaveLength(2);
  });
});
describe("commissioning verification", () => {
  test("requires a new session, correct MAC, and fresh complete telemetry", () => {
    const expected = target({ mac: "001122334455" });
    const baseline = { "001122334455": 1 };
    expect(runtimeCandidates(expected, [device()], baseline, [])).toHaveLength(
      1,
    );
    for (const wrong of [
      device({ connection_id: 1 }),
      device({ connection_id: 0 }),
      device({ online: false }),
      device({ mac: "112233445566" }),
      device({ outlets: [] }),
      device({
        outlets: device().outlets.map((outlet) => ({
          ...outlet,
          telemetry_at: 0,
        })),
      }),
    ])
      expect(runtimeCandidates(expected, [wrong], baseline, [])).toHaveLength(
        0,
      );
    expect(
      runtimeCandidates(expected, [device()], baseline, ["001122334455"]),
    ).toHaveLength(0);
  });
  test("unknown identity presents all new candidates without assigning one", () => {
    const candidates = runtimeCandidates(
      target(),
      [device(), device({ mac: "112233445566" })],
      {},
      [],
    );
    expect(candidates.map((candidate) => candidate.mac)).toEqual([
      "001122334455",
      "112233445566",
    ]);
  });
  test("settings applied remains true even if Wi-Fi restoration fails", () => {
    expect(
      settingsApplied({
        success: false,
        settings_applied: true,
        network_restored: false,
        logs: [],
        message: "Restore failed",
      }),
    ).toBe(true);
    expect(
      settingsApplied({
        success: false,
        settings_applied: false,
        network_restored: true,
        logs: [],
        message: "Rejected",
      }),
    ).toBe(false);
  });
  test("dark is the initial theme without stored preferences", () => {
    expect(initialTheme()).toBe("dark");
  });
});
