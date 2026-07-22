import { useState } from "react";

export interface VerticalBarDatum {
  label: string;
  value: number;
  color?: string;
}

/**
 * Thin vertical bars, rounded data-ends, recessive gridline baseline, and a
 * simple hover tooltip. Used for ticket volume by category / by day.
 */
export function VerticalBarChart({
  data,
  valueFormatter = (v) => String(v),
  height = 180,
}: {
  data: VerticalBarDatum[];
  valueFormatter?: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div className="empty-state">No data yet</div>;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height,
          borderBottom: "1px solid var(--baseline)",
          paddingTop: 24,
        }}
      >
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const color = d.color ?? "var(--series-1)";
          return (
            <div
              key={d.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                position: "relative",
                minWidth: 0,
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div
                  style={{
                    position: "absolute",
                    bottom: `calc(${pct}% + 8px)`,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "3px 7px",
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                    boxShadow: "var(--shadow-sm)",
                    zIndex: 1,
                  }}
                >
                  {valueFormatter(d.value)}
                </div>
              )}
              <div
                style={{
                  width: "60%",
                  minWidth: 6,
                  height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                  background: color,
                  borderRadius: "4px 4px 0 0",
                  transition: "filter 0.12s",
                  filter: hover === i ? "brightness(1.12)" : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {data.map((d) => (
          <div
            key={d.label}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
