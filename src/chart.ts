export interface PlotPoint {
  x: number;
  y: number;
}

export function linePath(points: PlotPoint[]): string {
  // Splines can overshoot observed extrema and suggest unmeasured load peaks.
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
}

export function areaPath(points: PlotPoint[], baseline: number): string {
  if (points.length < 2) return "";
  return `${linePath(points)} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`;
}
