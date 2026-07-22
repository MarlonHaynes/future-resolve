export interface HorizontalBarDatum {
  label: string;
  value: number;
  sub?: string;
}

/** Per-agent load bars — single categorical series (blue), direct-labeled. */
export function HorizontalBarChart({
  data,
  valueFormatter = (v) => String(v),
}: {
  data: HorizontalBarDatum[];
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div className="empty-state">No agents yet</div>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label}>
            <div className="spread" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                {valueFormatter(d.value)}
                {d.sub ? ` · ${d.sub}` : ""}
              </span>
            </div>
            <div
              style={{
                background: "var(--gridline)",
                borderRadius: 4,
                height: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(pct, d.value > 0 ? 3 : 0)}%`,
                  height: "100%",
                  background: "var(--series-1)",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
