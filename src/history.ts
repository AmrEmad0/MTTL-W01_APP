import type { HistoryPoint, TelemetryRecord } from "./types";
export type ChartMetric = "average_power_w" | "energy_kwh" | "temperature_c";
export function chartSegments(
  points: HistoryPoint[],
  metric: ChartMetric,
  bucketSeconds: number,
): HistoryPoint[][] {
  const segments: HistoryPoint[][] = [];
  let current: HistoryPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (
      point[metric] === null ||
      (previous && point.timestamp - previous.timestamp > bucketSeconds * 1.5)
    ) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point[metric] !== null) current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}
export function historyCsv(records: TelemetryRecord[]): string {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const fields: (keyof TelemetryRecord)[] = [
    "id",
    "mac",
    "channel",
    "recorded_at",
    "relay_on",
    "power_w",
    "energy_kwh",
    "secondary_energy_kwh",
    "energy_budget_kwh",
    "temperature_c",
    "overload_ok",
    "overheat_ok",
    "countdown_sec",
    "standby_threshold_w",
    "standby_cutoff_enabled",
    "event_code",
  ];
  return [
    fields.join(","),
    ...records.map((record) =>
      fields.map((field) => cell(record[field])).join(","),
    ),
  ].join("\r\n");
}
export function localDateInput(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
