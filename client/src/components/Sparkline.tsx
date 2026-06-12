import React from "react";

/** Lightweight SVG sparkline for last-7d price trend (index-based, oldest→newest). */
export function Sparkline({
  data,
  positive = true,
  width = 72,
  height = 26,
}: {
  data: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) {
    return <div className="text-muted-foreground/50 text-[10px]">—</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "#00f0ff" : "#ff2e63";
  return (
    <svg width={width} height={height} className="overflow-visible">
      {positive && (
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.18"
        />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
