import type { HistoryChart, OutletTarget } from "./types";
export interface AnalysisSeries {
  target: OutletTarget;
  name: string;
  chart: HistoryChart;
}
export function pairedPowerDifference(
  a: HistoryChart,
  b: HistoryChart,
): { watts: number | null; buckets: number } {
  const right = new Map(
    b.points.map((point) => [point.timestamp, point.average_power_w]),
  );
  const deltas = a.points.flatMap((point) => {
    const other = right.get(point.timestamp);
    return point.average_power_w !== null && other != null
      ? [point.average_power_w - other]
      : [];
  });
  return {
    watts: deltas.length
      ? deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length
      : null,
    buckets: deltas.length,
  };
}
export function analysisCsv(series: AnalysisSeries[]): string {
  const cell = (value: string | number | null) => {
    if (value === null) return '""';
    const safe =
      typeof value === "string" && /^[=+\-@\t\r]/.test(value)
        ? `'${value}`
        : String(value);
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows: (string | number | null)[][] = [
    [
      "outlet_name",
      "mac",
      "channel",
      "bucket_at",
      "bucket_seconds",
      "average_power_w",
      "peak_power_w",
      "observed_energy_kwh",
      "max_temperature_c",
      "samples",
    ],
  ];
  for (const item of series)
    for (const point of item.chart.points)
      rows.push([
        item.name,
        item.target.mac,
        item.target.channel,
        point.timestamp,
        item.chart.bucket_seconds,
        point.average_power_w,
        point.peak_power_w,
        point.energy_kwh,
        point.temperature_c,
        point.samples,
      ]);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
