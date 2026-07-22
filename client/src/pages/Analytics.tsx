import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AnalyticsSummary } from "../types";
import { StatTile } from "../components/charts/StatTile";
import { VerticalBarChart } from "../components/charts/VerticalBarChart";
import { HorizontalBarChart } from "../components/charts/HorizontalBarChart";

const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AnalyticsSummary>("/analytics/summary")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <div className="empty-state">Loading analytics...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <div className="page-subtitle">{data.totals.total_tickets} tickets total, admin-only view</div>
        </div>
      </div>

      <div className="stat-tiles">
        <StatTile label="Avg. Resolution Time" value={formatMinutes(data.avgResolutionMinutes)} />
        <StatTile
          label="SLA Breach Rate"
          value={`${data.slaBreachPct}%`}
          sub={`${data.slaBreachedCount} of ${data.slaTotalWithDeadline} tickets`}
        />
        <StatTile label="Open Tickets" value={String(data.totals.open_count)} />
        <StatTile label="Resolved Tickets" value={String(data.totals.resolved_count)} />
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <h3 className="chart-title">Ticket Volume by Category</h3>
          <VerticalBarChart
            data={data.ticketsByCategory.map((c, i) => ({
              label: c.category,
              value: c.count,
              color: SERIES_COLORS[i % SERIES_COLORS.length],
            }))}
          />
        </div>

        <div className="card chart-card">
          <h3 className="chart-title">Ticket Volume by Day (last 14 days)</h3>
          <VerticalBarChart
            data={data.ticketsByDay.map((d) => ({ label: formatDay(d.day), value: d.count }))}
          />
        </div>

        <div className="card chart-card" style={{ gridColumn: "1 / -1" }}>
          <h3 className="chart-title">Per-Agent Load</h3>
          <HorizontalBarChart
            data={data.perAgentLoad.map((a) => ({
              label: a.name,
              value: a.current_workload,
              sub: `${a.resolved_count} resolved`,
            }))}
            valueFormatter={(v) => `${v} active`}
          />
        </div>
      </div>
    </div>
  );
}
