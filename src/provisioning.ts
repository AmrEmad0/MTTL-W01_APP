import type {
  DeviceInfo,
  NetworkHost,
  ProvisionTarget,
  ProvisionResult,
} from "./types";
import { deviceFresh } from "./status";
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
