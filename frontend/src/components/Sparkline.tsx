interface Props {
  points: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ points, width = 200, height = 32 }: Props) {
  if (points.length === 0) {
    return (
      <svg width={width} height={height} className="sparkline">
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--line)"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const y = (v: number) => height - ((v - min) / range) * height;
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const lastX = (points.length - 1) * stepX;
  const lastY = y(points[points.length - 1]);
  return (
    <svg width={width} height={height} className="sparkline">
      <path d={d} fill="none" stroke="var(--seal)" strokeWidth={1.4} />
      <circle cx={lastX} cy={lastY} r={2.2} fill="var(--seal)" />
    </svg>
  );
}
