import { localeTag } from "./i18n";
import type { DeviceInfo, OutletState } from "./types";

export const STALE_AFTER_SECONDS = 30;
export function telemetryFresh(
  outlet: OutletState,
  now = Date.now() / 1000,
): boolean {
  return (
    outlet.telemetry_at > 0 &&
    now - outlet.telemetry_at >= -2 &&
    now - outlet.telemetry_at <= STALE_AFTER_SECONDS
  );
}
export function deviceFresh(
  device: DeviceInfo,
  now = Date.now() / 1000,
): boolean {
  return (
    device.online &&
    device.outlets.length === 4 &&
    new Set(device.outlets.map((o) => o.channel)).size === 4 &&
    device.outlets.every((o) => telemetryFresh(o, now))
  );
}
export function deviceStatus(device: DeviceInfo): string {
  if (!device.online) return "Offline";
  if (!deviceFresh(device))
    return device.outlets.some((o) => o.telemetry_at > 0)
      ? "Stale telemetry"
      : "Awaiting telemetry";
  if (device.outlets.some(outletFault)) return "Protection trip";
  return "Online";
}
export function outletFault(outlet: OutletState): boolean {
  return (
    !outlet.overload_ok ||
    !outlet.overheat_ok ||
    !["00", "04"].includes(outlet.event_code)
  );
}
export function relativeTime(
  timestamp: number,
  now = Date.now() / 1000,
): string {
  if (!timestamp) return "Not received";
  const age = Math.max(0, Math.floor(now - timestamp));
  if (age < 2) return "Just now";
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return new Date(timestamp * 1000).toLocaleString(localeTag());
}
export function relayTargetsConfirmed(
  devices: DeviceInfo[],
  targets: {
    mac: string;
    channels: number[];
    on: boolean;
    revisions: Record<number, number>;
  }[],
): boolean {
  return (
    targets.length > 0 &&
    targets.every((target) => {
      const device = devices.find((d) => d.mac === target.mac);
      return (
        device?.online &&
        target.channels.length > 0 &&
        target.channels.every((channel) => {
          const outlet = device.outlets.find((o) => o.channel === channel);
          return (
            outlet &&
            outlet.updated_at > 0 &&
            outlet.on === target.on &&
            outlet.report_revision > (target.revisions[channel] ?? 0)
          );
        })
      );
    })
  );
}
export function validIpv4(value: string): boolean {
  const parts = value.trim().split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}
export function validSubnet(value: string): boolean {
  const [ip, prefix, ...extra] = value.trim().split("/");
  return (
    extra.length === 0 &&
    validIpv4(ip) &&
    (prefix === undefined || prefix === "24")
  );
}
