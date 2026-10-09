import { linePath, areaPath } from "../chart";
import { useState, useMemo, useId } from "react";
import { localize, localeTag } from "../i18n";
import { chartSegments, type ChartMetric } from "../history";
import type { HistoryPoint } from "../types";

interface Props {
  title: string;
  unit: string;
  metric: ChartMetric;
  points: HistoryPoint[];
  bucketSeconds: number;
  from: number;
  to: number;
}

const format = (value: number, unit: string) =>
  `${value.toFixed(unit === "kWh" ? 3 : 1)} ${unit}`;

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

export function UsageChart({
  title,
  unit,
  metric,
  points,
  bucketSeconds,
  from,
  to,
}: Props) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const gradientId = useId();
  const locale = localeTag();

  const observed = useMemo(
    () => points.filter((point) => point[metric] !== null),
    [points, metric],
  );

  const width = 880;
  const height = 270;
  const left = 68;
  const right = 20;
  const top = 22;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const totalDuration = Math.max(1, to - from);

  // Y-axis range calculation with clean round max
  const { minVal, maxVal, yTicks } = useMemo(() => {
    const values = observed.map((p) => p[metric]!);
    const rawMin = values.length ? Math.min(0, ...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 10;

    let targetMax = Math.max(
      rawMin + 1,
      rawMax * (metric === "temperature_c" ? 1.1 : 1.15),
    );
    if (metric === "energy_kwh") {
      targetMax = Math.max(0.01, Math.ceil(targetMax * 100) / 100);
    } else if (metric === "temperature_c") {
      targetMax = Math.max(40, Math.ceil(targetMax / 10) * 10);
    } else {
      if (targetMax <= 25) targetMax = Math.ceil(targetMax / 5) * 5;
      else if (targetMax <= 100) targetMax = Math.ceil(targetMax / 10) * 10;
      else if (targetMax <= 500) targetMax = Math.ceil(targetMax / 50) * 50;
      else targetMax = Math.ceil(targetMax / 100) * 100;
    }

    const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((frac) => ({
      val: rawMin + frac * (targetMax - rawMin),
      yPos: top + plotHeight - frac * plotHeight,
    }));

    return { minVal: rawMin, maxVal: targetMax, yTicks: ticks };
  }, [observed, metric, plotHeight, top]);

  // Coordinate scales (accurate distance mapping in time and value)
  const x = (timestamp: number) =>
    left +
    ((Math.max(from, Math.min(to, timestamp)) - from) / totalDuration) *
      plotWidth;

  const y = (val: number) =>
    top +
    plotHeight -
    ((val - minVal) / Math.max(1e-6, maxVal - minVal)) * plotHeight;

  // Active chosen point based on hover time or newest point
  const chosenPoint = useMemo(() => {
    if (!observed.length) return null;
    if (hoverTime === null) return observed[observed.length - 1];

    let nearest = observed[0];
    let minDiff = Math.abs(nearest.timestamp - hoverTime);
    for (let i = 1; i < observed.length; i++) {
      const diff = Math.abs(observed[i].timestamp - hoverTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = observed[i];
      }
    }
    return nearest;
  }, [observed, hoverTime]);

  const activeX =
    hoverX !== null ? hoverX : chosenPoint ? x(chosenPoint.timestamp) : left;

  // Equidistant time ticks
  const timeTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
      const time = from + frac * totalDuration;
      return {
        x: left + frac * plotWidth,
        label: formatTimeLabel(time, totalDuration, locale),
      };
    });
  }, [from, totalDuration, plotWidth, left, locale]);

  const segments = useMemo(
    () => chartSegments(points, metric, bucketSeconds),
    [points, metric, bucketSeconds],
  );

  const isTemp = metric === "temperature_c";
  const isEnergy = metric === "energy_kwh";
  const strokeColor = isTemp
    ? "var(--chart-temperature)"
    : "var(--chart-power)";

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
      className="panel usage-chart"
      style={{ padding: "20px", marginBottom: "22px" }}
    >
      <div className="section-heading" style={{ marginBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h3>
          <p className="chart-description">{`${title}. ${observed.length} recorded time buckets.`}</p>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {metric === "energy_kwh"
              ? "Positive energy accumulation within captured intervals"
              : metric === "temperature_c"
                ? "Reported operating temperature over time"
                : "Average electrical load telemetry over time"}
          </span>
        </div>
        <span
          className="meta-chip"
          style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
        >
          {unit}
        </span>
      </div>

      {!observed.length ? (
        <div
          className="chart-empty"
          style={{ minHeight: "220px", display: "grid", placeItems: "center" }}
        >
          {metric === "energy_kwh"
            ? "At least two counter readings within 30 seconds are required to measure usage."
            : "No recorded readings in this interval."}
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
              aria-label={`${title} telemetry chart`}
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
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={strokeColor}
                    stopOpacity="0.25"
                  />
                  <stop
                    offset="100%"
                    stopColor={strokeColor}
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              {/* HORIZONTAL GRID LINES & Y LABELS */}
              {yTicks.map(({ val, yPos }) => (
                <g key={val}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={yPos}
                    y2={yPos}
                    stroke="var(--border-subtle, rgba(255,255,255,0.08))"
                    strokeWidth={val === 0 ? 1.5 : 1}
                    strokeDasharray={val === 0 ? undefined : "3 4"}
                  />
                  <text
                    x={left - 10}
                    y={yPos + 4}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="11px"
                    fontFamily="var(--font-mono)"
                  >
                    {val.toFixed(unit === "kWh" ? 3 : 0)}
                  </text>
                </g>
              ))}

              {/* ENERGY BARS */}
              {isEnergy && (
                <g>
                  {observed.map((point) => {
                    const barX = x(point.timestamp);
                    const barW = Math.max(
                      3,
                      Math.min(
                        24,
                        (bucketSeconds / totalDuration) * plotWidth - 2,
                      ),
                    );
                    const barY = y(point.energy_kwh!);
                    const barH = Math.max(1, y(0) - barY);

                    return (
                      <rect
                        key={point.timestamp}
                        x={Math.max(left, barX - barW / 2)}
                        y={barY}
                        width={barW}
                        height={barH}
                        rx={2.5}
                        fill={strokeColor}
                        opacity={
                          chosenPoint?.timestamp === point.timestamp ? 1 : 0.75
                        }
                      >
                        <title>
                          {new Date(point.timestamp * 1000).toLocaleString(
                            localeTag(),
                          )}
                          : {format(point.energy_kwh!, unit)}
                        </title>
                      </rect>
                    );
                  })}
                </g>
              )}

              {/* CONTINUOUS CURVES (Power / Temperature) */}
              {!isEnergy &&
                segments.map((segment, segIdx) => {
                  const validPts = segment.map((pt) => ({
                    x: x(pt.timestamp),
                    y: y(pt[metric]!),
                  }));

                  const lineD = linePath(validPts);
                  const areaD = areaPath(validPts, top + plotHeight);

                  return (
                    <g key={segIdx}>
                      {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
                      {lineD && (
                        <path
                          d={lineD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {validPts.length === 1 && (
                        <circle
                          cx={validPts[0].x}
                          cy={validPts[0].y}
                          r={4}
                          fill={strokeColor}
                        />
                      )}
                    </g>
                  );
                })}

              {/* VERTICAL HOVER CROSSHAIR */}
              {chosenPoint && activeX >= left && activeX <= width - right && (
                <g>
                  <line
                    x1={activeX}
                    x2={activeX}
                    y1={top}
                    y2={top + plotHeight}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    opacity={0.8}
                  />
                  {!isEnergy && (
                    <>
                      <circle
                        cx={activeX}
                        cy={y(chosenPoint[metric]!)}
                        r={6}
                        fill={strokeColor}
                        opacity={0.3}
                      />
                      <circle
                        cx={activeX}
                        cy={y(chosenPoint[metric]!)}
                        r={3.5}
                        fill={strokeColor}
                        stroke="var(--surface, #0f172a)"
                        strokeWidth={2}
                      />
                    </>
                  )}
                </g>
              )}

              {/* TIME AXIS LABELS (5 accurate equidistant labels) */}
              {timeTicks.map((tick, i) => (
                <text
                  key={i}
                  x={tick.x}
                  y={height - 12}
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
            max={Math.max(0, observed.length - 1)}
            value={Math.max(
              0,
              observed.findIndex((point) => point === chosenPoint),
            )}
            aria-label={`Inspect ${title} readings`}
            aria-valuetext={
              chosenPoint
                ? `${new Date(chosenPoint.timestamp * 1000).toLocaleString(locale)}: ${format(chosenPoint[metric]!, unit)}`
                : undefined
            }
            onChange={(event) => {
              const point = observed[Number(event.target.value)];
              if (point) {
                setHoverTime(point.timestamp);
                setHoverX(null);
              }
            }}
          />
          {chosenPoint && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px 14px",
                background: "var(--surface-subtle, rgba(255, 255, 255, 0.03))",
                borderRadius: "8px",
                border:
                  "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: strokeColor,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {new Date(chosenPoint.timestamp * 1000).toLocaleString(
                    localeTag(),
                  )}
                </span>
              </div>

              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <strong
                  style={{
                    fontSize: "1.1rem",
                    fontFamily: "var(--font-mono)",
                    color: strokeColor,
                  }}
                >
                  {format(chosenPoint[metric]!, unit)}
                </strong>
                <span
                  style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                >
                  {chosenPoint.samples} samples
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>,
  );
}
