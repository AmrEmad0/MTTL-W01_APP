import { describe, expect, test } from "bun:test";
import {
  canonicalMac,
  matchHostDevice,
  mergeTargets,
  runtimeCandidates,
  settingsApplied,
  sendStripSettings,
  stripJoinPassword,
} from "../src/provisioning";
import { renderToStaticMarkup } from "react-dom/server";
import { setLanguage } from "../src/i18n";
import { ManualWifiSteps } from "../src/components/ManualWifiSteps";
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

describe("guided Wi-Fi setup", () => {
  test("Windows sends settings directly even for a discovered AP", async () => {
    const calls: { command: string; args: unknown[] }[] = [];
    const result = {
      success: true,
      settings_applied: true,
      network_restored: null,
      logs: [],
      message: "Accepted",
    };
    const transport = {
      autoProvision: async (...args: unknown[]) => {
        calls.push({ command: "auto", args });
        return result;
      },
      provisionDevice: async (...args: unknown[]) => {
        calls.push({ command: "manual", args });
        return result;
      },
    };
    const settings = {
      controllerIp: "192.168.1.96",
      controllerPort: 10086,
      homeSsid: "Home",
      homePassword: " home password ",
      portStrategy: "standard",
    };
    const selected = target({ ssid: "TONLY_TAP_991BDD8" });
    expect(await sendStripSettings(transport, selected, false, settings)).toBe(
      result,
    );
    expect(calls).toEqual([
      {
        command: "manual",
        args: [
          "192.168.1.1",
          30300,
          "192.168.1.96",
          "Home",
          " home password ",
          10086,
          "standard",
        ],
      },
    ]);
    calls.length = 0;
    await sendStripSettings(transport, selected, true, settings);
    expect(calls[0].command).toBe("auto");
    expect(calls[0].args[1]).toBe("LGU_991BDD8");
    calls.length = 0;
    await sendStripSettings(
      transport,
      { ...selected, mode: "manual" },
      true,
      settings,
    );
    expect(calls[0].command).toBe("manual");
  });
  test("derives join password and preserves an explicit password exactly", () => {
    expect(stripJoinPassword("TONLY_TAP_991BDD8")).toBe("LGU_991BDD8");
    expect(stripJoinPassword(" ONLY_TAP_ABCDEF ")).toBe("LGU_ABCDEF");
    expect(stripJoinPassword("TONLY_TAP_ABCDEF", " custom password ")).toBe(
      " custom password ",
    );
    expect(stripJoinPassword("")).toBe("");
  });
  test("join and reconnect steps show distinct networks and localized actions", () => {
    const props = {
      target: target({ ssid: "TONLY_TAP_991BDD8" }),
      homeSsid: "Online",
      busy: false,
      onContinue: () => {},
      onCancel: () => {},
    };
    try {
      setLanguage("en");
      const join = renderToStaticMarkup(
        <ManualWifiSteps {...props} stage="join" />,
      );
      expect(join).toContain("LGU_991BDD8");
      expect(join).toContain("I am connected — send settings");
      expect(join).toContain("Scanning again is not required");
      expect(join).not.toContain("Linux");
      const reconnect = renderToStaticMarkup(
        <ManualWifiSteps {...props} stage="reconnect" />,
      );
      expect(reconnect).toContain('value="Online"');
      expect(reconnect).toContain("I reconnected — check connection");
      expect(reconnect).not.toContain("LGU_991BDD8");
      setLanguage("ar");
      const arabicJoin = renderToStaticMarkup(
        <ManualWifiSteps {...props} stage="join" />,
      );
      expect(arabicJoin).toContain("كلمة المرور للاتصال بشبكة المشترك");
      expect(arabicJoin).toContain("أنا متصل — أرسل الإعدادات");
      expect(arabicJoin).toContain("LGU_991BDD8");
      expect(arabicJoin).not.toContain("I am connected");
      const arabicReconnect = renderToStaticMarkup(
        <ManualWifiSteps {...props} stage="reconnect" />,
      );
      expect(arabicReconnect).toContain('value="Online"');
      expect(arabicReconnect).toContain(
        "أعدت الاتصال — تحقّق من اتصال المشترك",
      );
    } finally {
      setLanguage("en");
    }
  });
});
