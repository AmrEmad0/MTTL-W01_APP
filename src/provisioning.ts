import type {
  DeviceInfo,
  NetworkHost,
  ProvisionTarget,
  ProvisionResult,
} from "./types";
import { deviceFresh } from "./status";
import type { api } from "./api";

export function stripJoinPassword(ssid: string, password?: string): string {
  const clean = ssid.trim();
  return (
    password || (clean ? `LGU_${clean.slice(clean.lastIndexOf("_") + 1)}` : "")
  );
}

export function usesAutomaticWifi(
  target: ProvisionTarget,
  supported: boolean,
): boolean {
  return supported && target.mode === "auto";
}

export interface StripSetupSettings {
  controllerIp: string;
  controllerPort: number;
  homeSsid: string;
  homePassword: string;
  portStrategy: string;
}

export function sendStripSettings(
  transport: Pick<typeof api, "autoProvision" | "provisionDevice">,
  target: ProvisionTarget,
  automaticWifi: boolean,
  settings: StripSetupSettings,
): Promise<ProvisionResult> {
  if (usesAutomaticWifi(target, automaticWifi)) {
    return transport.autoProvision(
      target.ssid!,
      stripJoinPassword(target.ssid!, target.password),
      settings.controllerIp,
      settings.homeSsid,
      settings.homePassword,
      target.ip,
      target.port,
      target.bssid,
      settings.controllerPort,
      settings.portStrategy,
    );
  }
  return transport.provisionDevice(
    target.ip,
    target.port,
    settings.controllerIp,
    settings.homeSsid,
    settings.homePassword,
    settings.controllerPort,
    settings.portStrategy,
  );
}
export function canonicalMac(value: string | undefined): string {
  const clean = (value || "").replace(/[:-]/g, "").trim().toUpperCase();
  return /^[0-9A-F]{12}$/.test(clean) &&
    !["000000000000", "FFFFFFFFFFFF"].includes(clean)
    ? clean
    : "";
}
export function matchHostDevice<T extends { mac: string; ip: string }>(
  host: NetworkHost,
  devices: T[],
): T | undefined {
  const mac = canonicalMac(host.mac);
  return mac
    ? devices.find((device) => canonicalMac(device.mac) === mac)
    : undefined;
}
export function targetKey(target: ProvisionTarget): string {
  return target.mode === "auto"
    ? `ap:${target.ssid}:${target.bssid || ""}`
    : `tcp:${target.ip}:${target.port}`;
}
export function mergeTargets(
  existing: ProvisionTarget[],
  additions: ProvisionTarget[],
): ProvisionTarget[] {
  const result = [...existing];
  for (const target of additions) {
    if (
      result.some(
        (item) =>
          targetKey(item) === targetKey(target) ||
          (!!canonicalMac(target.mac) &&
            canonicalMac(item.mac) === canonicalMac(target.mac)),
      )
    )
      continue;
    result.push(target);
  }
  return result;
}
export function runtimeCandidates(
  target: ProvisionTarget,
  devices: DeviceInfo[],
  baseline: Record<string, number>,
  claimed: string[],
): DeviceInfo[] {
  const expected = canonicalMac(target.mac);
  return devices.filter(
    (device) =>
      deviceFresh(device) &&
      device.connection_id > 0 &&
      device.connection_id !== (baseline[device.mac] || 0) &&
      !claimed.includes(device.mac) &&
      (!expected || device.mac === expected),
  );
}
export function settingsApplied(result: ProvisionResult): boolean {
  return (
    result.settings_applied ??
    result.logs.some((step) => step.step === 4 && step.success)
  );
}
