import { linePath, areaPath } from "../chart";
import { useState, useMemo, useId } from "react";
import { chartSegments } from "../history";
import type { AnalysisSeries } from "../analyzer";
import type { HistoryPoint } from "../types";
import { localize, localeTag, t } from "../i18n";

interface Props {
  series: AnalysisSeries[];
  from: number;
  to: number;
}

const SERIES_COLORS = [
  { stroke: "var(--chart-power)" },
  { stroke: "var(--chart-temperature)" },
  { stroke: "var(--chart-green)" },
  { stroke: "var(--chart-purple)" },
];

function formatTimeLabel(
  timestamp: number,
  durationSec: number,
  locale: string,
): string {
  const d = new Date(timestamp * 1000);
  if (durationSec <= 86400) {
    return d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PowerComparisonChart({ series, from, to }: Props) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const gradientId = useId();
  const locale = localeTag();
  const readingTimes = useMemo(
    () =>
      [
        ...new Set(
          series.flatMap((item) =>
            item.chart.points
              .filter((point) => point.average_power_w !== null)
              .map((point) => point.timestamp),
          ),
        ),
      ].sort((a, b) => a - b),
    [series],
  );

  const width = 920;
  const height = 300;
  const left = 68;
  const right = 24;
  const top = 25;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const totalDuration = Math.max(1, to - from);

  // Check if any samples exist
  const hasSamples = series.some((s) =>
    s.chart.points.some((p) => p.average_power_w !== null),
  );

  // Calculate nice Y maximum
  const niceMax = useMemo(() => {
    const allVals = series.flatMap((s) =>
      s.chart.points
        .map((p) => p.average_power_w)
        .filter((v): v is number => v !== null),
    );
    const rawMax = allVals.length ? Math.max(...allVals) : 100;
    let target = Math.max(10, Math.ceil(rawMax * 1.15));
    if (target <= 25) target = Math.ceil(target / 5) * 5;
    else if (target <= 100) target = Math.ceil(target / 10) * 10;
    else if (target <= 500) target = Math.ceil(target / 50) * 50;
    else target = Math.ceil(target / 100) * 100;
    return target;
  }, [series]);

  // Coordinate scales (accurate distance mapping in time and watts)
  const x = (timestamp: number) =>
    left +
    ((Math.max(from, Math.min(to, timestamp)) - from) / totalDuration) *
      plotWidth;

  const y = (watts: number) =>
    top + plotHeight - (Math.max(0, watts) / niceMax) * plotHeight;

  // Find nearest point for a given time
  const findClosestPoint = (
    points: HistoryPoint[],
    targetTime: number,
    maxDistanceSec: number,
  ) => {
    let closest: HistoryPoint | null = null;
    let minDiff = Infinity;
    for (const p of points) {
      if (p.average_power_w !== null) {
        const diff = Math.abs(p.timestamp - targetTime);
        if (diff < minDiff && diff <= maxDistanceSec) {
          minDiff = diff;
          closest = p;
        }
      }
    }
    return closest;
  };

  // Currently inspected time (hover or latest available point)
  const activeTime = useMemo(() => {
    if (hoverTime !== null) return hoverTime;
    // Default to the newest sample point across series
    const allTimestamps = series.flatMap((s) =>
      s.chart.points
        .filter((p) => p.average_power_w !== null)
        .map((p) => p.timestamp),
    );
    return allTimestamps.length ? Math.max(...allTimestamps) : to;
  }, [hoverTime, series, to]);

  const activePoints = useMemo(() => {
    return series.map((item) => {
      const maxDist = item.chart.bucket_seconds / 2;
      return {
        series: item,
        point: findClosestPoint(item.chart.points, activeTime, maxDist),
      };
    });
  }, [series, activeTime]);

  const activeX = hoverX !== null ? hoverX : x(activeTime);

  // Time ticks (5 evenly spaced ticks along the time axis)
  const timeTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
      const time = from + frac * totalDuration;
      return {
        x: left + frac * plotWidth,
        label: formatTimeLabel(time, totalDuration, locale),
      };
    });
  }, [from, totalDuration, plotWidth, left, locale]);

  // Y-axis grid ticks (4 grid intervals)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((frac) => ({
    watts: frac * niceMax,
    y: top + plotHeight - frac * plotHeight,
  }));

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.max(left, Math.min(width - right, relX));
    const tVal = from + ((clampedX - left) / plotWidth) * totalDuration;
    setHoverX(clampedX);
    setHoverTime(tVal);
  };

  const handlePointerLeave = () => {
    setHoverTime(null);
    setHoverX(null);
  };

  return localize(
    <section
      className="panel view-panel comparison-chart"
      style={{ padding: "20px", marginBottom: "24px" }}
    >
      <div className="section-heading" style={{ marginBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
            {t("Power comparison")}
          </h3>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {t("Recorded outlet power on a shared time axis")}
          </span>
        </div>
        <span
          className="meta-chip"
          style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
        >
          {t("Watts")}
        </span>
      </div>

      {!hasSamples ? (
        <div
          className="chart-empty"
          style={{ minHeight: "220px", display: "grid", placeItems: "center" }}
        >
          {t(
            "Select outlets with saved readings to view power telemetry curves.",
          )}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {/* SVG CHART VIEWPORT */}
          <div
            className="chart-viewport"
            dir="ltr"
            style={{ overflow: "hidden", borderRadius: "8px" }}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="chart-svg"
              role="img"
              aria-label="Power comparison chart"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                cursor: "crosshair",
              }}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            >
              <defs>
                {/* Gradient Area Fills */}
                {series.map((_, idx) => {
                  const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                  return (
                    <linearGradient
                      id={`${gradientId}-${idx}`}
                      key={idx}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={color.stroke}
                        stopOpacity="0.25"
                      />
                      <stop
                        offset="100%"
                        stopColor={color.stroke}
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* HORIZONTAL GRID LINES & LABELS */}
              {yTicks.map(({ watts, y: yPos }) => (
                <g key={watts}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={yPos}
                    y2={yPos}
                    stroke="var(--border-subtle, rgba(255,255,255,0.08))"
                    strokeWidth={watts === 0 ? 1.5 : 1}
                    strokeDasharray={watts === 0 ? undefined : "3 4"}
                  />
                  <text
                    x={left - 10}
                    y={yPos + 4}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="11px"
                    fontFamily="var(--font-mono)"
                  >
                    {watts.toFixed(0)} W
                  </text>
                </g>
              ))}

              {/* SERIES CURVES & AREA FILLS */}
              {series.map((item, index) => {
                const color = SERIES_COLORS[index % SERIES_COLORS.length];
                const segments = chartSegments(
                  item.chart.points,
                  "average_power_w",
                  item.chart.bucket_seconds,
                );

                return (
                  <g key={`${item.target.mac}:${item.target.channel}`}>
                    {segments.map((segment, segIdx) => {
                      const validPts = segment.map((pt) => ({
                        x: x(pt.timestamp),
                        y: y(pt.average_power_w!),
                      }));

                      const lineD = linePath(validPts);
                      const areaD = areaPath(validPts, top + plotHeight);

                      return (
                        <g key={segIdx}>
                          {/* Smooth Semi-Transparent Area Fill */}
                          {areaD && (
                            <path
                              d={areaD}
                              fill={`url(#${gradientId}-${index})`}
                              style={{ transition: "opacity 0.2s" }}
                            />
                          )}
                          {/* Smooth High-Definition Curve Line */}
                          {lineD && (
                            <path
                              d={lineD}
                              fill="none"
                              stroke={color.stroke}
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          {/* Single isolated point */}
                          {validPts.length === 1 && (
                            <circle
                              cx={validPts[0].x}
                              cy={validPts[0].y}
                              r={4}
                              fill={color.stroke}
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* VERTICAL HOVER CROSSHAIR */}
              {activeX >= left && activeX <= width - right && (
                <g>
                  <line
                    x1={activeX}
                    x2={activeX}
                    y1={top}
                    y2={top + plotHeight}
                    stroke="var(--accent-main, #38bdf8)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    opacity={0.8}
                  />
                  {/* Glowing Dots on hovered points */}
                  {activePoints.map(({ point }, idx) => {
                    if (!point || point.average_power_w === null) return null;
                    const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                    const ptY = y(point.average_power_w);
                    return (
                      <g key={idx}>
                        <circle
                          cx={activeX}
                          cy={ptY}
                          r={6}
                          fill={color.stroke}
                          opacity={0.3}
                        />
                        <circle
                          cx={activeX}
                          cy={ptY}
                          r={3.5}
                          fill={color.stroke}
                          stroke="var(--surface, #0f172a)"
                          strokeWidth={2}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* TIME AXIS LABELS (5 accurate equidistant labels) */}
              {timeTicks.map((tick, i) => (
                <text
                  key={i}
                  x={tick.x}
                  y={height - 14}
                  textAnchor={
                    i === 0
                      ? "start"
                      : i === timeTicks.length - 1
                        ? "end"
                        : "middle"
                  }
                  fill="var(--text-muted)"
                  fontSize="11px"
                  fontFamily="var(--font-mono)"
                >
                  {tick.label}
                </text>
              ))}
            </svg>
          </div>

          <input
            className="chart-reading-slider"
            type="range"
            dir="ltr"
            min={0}
            max={Math.max(0, readingTimes.length - 1)}
            value={Math.max(0, readingTimes.indexOf(activeTime))}
            aria-label="Inspect power comparison readings"
            aria-valuetext={new Date(activeTime * 1000).toLocaleString(locale)}
            onChange={(event) => {
              setHoverTime(readingTimes[Number(event.target.value)]);
              setHoverX(null);
            }}
          />

          <div
            style={{
              marginTop: "14px",
              padding: "10px 14px",
              background: "var(--surface-subtle, rgba(255, 255, 255, 0.03))",
              borderRadius: "8px",
              border:
                "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {activePoints.map(({ series: sItem, point }, idx) => {
                const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                return (
                  <div
                    key={`${sItem.target.mac}:${sItem.target.channel}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: color.stroke,
                        display: "inline-block",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      <bdi dir="auto">{sItem.name}:</bdi>
                    </span>
                    <strong
                      style={{
                        fontSize: "0.95rem",
                        fontFamily: "var(--font-mono)",
                        color: color.stroke,
                      }}
                    >
                      {point?.average_power_w != null
                        ? `${point.average_power_w.toFixed(1)} W`
                        : "—"}
                    </strong>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                fontSize: "0.825rem",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {new Date(activeTime * 1000).toLocaleString(localeTag())}
            </div>
          </div>
        </div>
      )}
    </section>,
  );
}
