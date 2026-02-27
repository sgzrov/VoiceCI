interface TtfbSparklineProps {
  values: number[];
  p90?: number;
  width?: number;
  height?: number;
}

export function TtfbSparkline({
  values,
  p90,
  width = 200,
  height = 40,
}: TtfbSparklineProps) {
  if (values.length < 2) return null;

  const padX = 8;
  const padY = 6;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * innerW,
    y: padY + innerH - ((v - min) / range) * innerH,
    value: v,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  const p90Y =
    p90 != null ? padY + innerH - ((p90 - min) / range) * innerH : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="overflow-visible"
      >
        {/* P90 threshold line */}
        {p90Y != null && p90Y >= padY && p90Y <= padY + innerH && (
          <line
            x1={padX}
            y1={p90Y}
            x2={width - padX}
            y2={p90Y}
            stroke="currentColor"
            strokeWidth={0.5}
            strokeDasharray="3,3"
            className="text-muted-foreground/40"
          />
        )}

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-muted-foreground"
        />

        {/* Dots */}
        {points.map((p, i) => {
          const overP90 = p90 != null && p.value > p90;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              className={overP90 ? "fill-red-500" : "fill-muted-foreground"}
            />
          );
        })}
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-muted-foreground">Turn 1</span>
        <span className="text-[9px] text-muted-foreground">
          Turn {values.length}
        </span>
      </div>
    </div>
  );
}
