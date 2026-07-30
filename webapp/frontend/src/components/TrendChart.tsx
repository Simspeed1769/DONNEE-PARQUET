import { useId, useMemo, useState } from "react";

type Metric = "reimbursed" | "expense" | "average_reimbursed" | "average_expense";
type AnnualPoint = {
  year: number;
  reimbursed: number;
  expense: number;
  average_reimbursed: number;
  average_expense: number;
};

type Props = {
  data: AnnualPoint[];
  metric: Metric;
  provisionalAfter?: number;
};

const WIDTH = 860;
const HEIGHT = 300;
const PAD = { top: 24, right: 22, bottom: 42, left: 68 };

function compact(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function money(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function TrendChart({ data, metric, provisionalAfter }: Props) {
  const gradientId = useId().replace(/:/g, "");
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (!data.length) return null;
    const values = data.map((item) => item[metric]);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const range = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
    const min = Math.max(0, rawMin - range * 0.22);
    const max = rawMax + range * 0.12;
    const innerWidth = WIDTH - PAD.left - PAD.right;
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (index: number) =>
      PAD.left + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
    const y = (value: number) => PAD.top + ((max - value) / (max - min)) * innerHeight;
    const points = data.map((item, index) => ({ x: x(index), y: y(item[metric]), item }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
    const area = `${line} L${points.at(-1)?.x},${HEIGHT - PAD.bottom} L${points[0].x},${HEIGHT - PAD.bottom} Z`;
    const ticks = Array.from({ length: 5 }, (_, index) => {
      const value = min + ((max - min) * index) / 4;
      return { value, y: y(value) };
    }).reverse();
    const provisionalIndex = provisionalAfter === undefined ? -1 : data.findIndex((item) => item.year > provisionalAfter);
    const provisionalX = provisionalIndex < 0 ? null : provisionalIndex === 0
      ? PAD.left
      : (points[provisionalIndex - 1].x + points[provisionalIndex].x) / 2;
    return { points, line, area, ticks, provisionalX };
  }, [data, metric, provisionalAfter]);

  if (!chart) return <div className="chart-empty">Aucune donnée sur cette sélection.</div>;

  return (
    <div className="trend-chart" onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Évolution annuelle">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4647" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#ef4647" stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.ticks.map((tick) => (
          <g key={tick.value}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.y} y2={tick.y} />
            <text className="chart-y-label" x={PAD.left - 14} y={tick.y + 4} textAnchor="end">
              {compact(tick.value)}
            </text>
          </g>
        ))}
        {chart.provisionalX !== null ? <g>
          <rect className="chart-provisional" x={chart.provisionalX} y={PAD.top} width={WIDTH - PAD.right - chart.provisionalX} height={HEIGHT - PAD.bottom - PAD.top} />
          <text className="chart-provisional-label" x={chart.provisionalX + 10} y={PAD.top + 16}>En consolidation</text>
        </g> : null}
        <path d={chart.area} fill={`url(#${gradientId})`} />
        <path className="chart-line" d={chart.line} />
        {chart.points.map((point, index) => (
          <g key={point.item.year}>
            <line
              className={`chart-guide ${hovered === index ? "is-visible" : ""}`}
              x1={point.x}
              x2={point.x}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
            <circle
              className={`chart-hit ${hovered === index ? "is-hovered" : ""}`}
              cx={point.x}
              cy={point.y}
              r="16"
              onMouseEnter={() => setHovered(index)}
            />
            <circle className="chart-dot" cx={point.x} cy={point.y} r={hovered === index ? 6 : 4.5} />
            <text className="chart-x-label" x={point.x} y={HEIGHT - 16} textAnchor="middle">
              {point.item.year}
            </text>
          </g>
        ))}
      </svg>
      {hovered !== null && chart.points[hovered] ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(chart.points[hovered].x / WIDTH) * 100}%`,
            top: `${(chart.points[hovered].y / HEIGHT) * 100}%`,
          }}
        >
          <span>{chart.points[hovered].item.year}</span>
          <strong>{money(chart.points[hovered].item[metric])}</strong>
        </div>
      ) : null}
    </div>
  );
}
