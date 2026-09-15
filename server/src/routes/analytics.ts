import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analyticsRouter = Router();

// Every metric here is an aggregate over the whole tickets table — nothing is
// scoped to the dashboard's current page or filters.

// A ticket counts as having breached if the SLA engine ever handled a breach
// on it (escalated/restarted tickets carry a fresh future deadline, so the
// deadline alone no longer shows it), or it was resolved late, or it is
// currently overdue and not yet handled by the sweep.
const EVER_BREACHED_SQL = `(
  sla_breach_count > 0 or
  (sla_deadline is not null and resolved_at is not null and resolved_at > sla_deadline) or
  (sla_deadline is not null and resolved_at is null and sla_deadline < now())
)`;

const SLA_OUTCOMES = ["escalated", "auto_resolved", "restarted", "breached_final"] as const;
analyticsRouter.use(requireAuth, requireRole("admin"));

analyticsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [avgResolution, breachRate, byCategory, byDay, perAgent, totals, outcomes] = await Promise.all([
      // auto-closed tickets weren't actually worked, so they'd distort agent resolution time
      pool.query(
        `select avg(extract(epoch from (resolved_at - created_at)) / 60)::numeric(10,1) as avg_minutes
         from tickets where resolved_at is not null and sla_outcome is distinct from 'auto_resolved'`
      ),
      pool.query(
        `select
           count(*) filter (where sla_deadline is not null) as total_with_sla,
           count(*) filter (where ${EVER_BREACHED_SQL}) as breached,
           count(*) filter (
             where status != 'resolved' and sla_deadline is not null and sla_deadline < now()
           )::int as currently_overdue
         from tickets`
      ),
      pool.query(
        `select category, count(*)::int as count from tickets group by category order by count desc`
      ),
      pool.query(
        `select date_trunc('day', created_at)::date as day, count(*)::int as count
         from tickets
         where created_at >= now() - interval '14 days'
         group by day
         order by day asc`
      ),
      pool.query(
        `select a.id, a.name, a.current_workload,
                count(t.id) filter (
                  where t.status = 'resolved' and t.sla_outcome is distinct from 'auto_resolved'
                )::int as resolved_count,
                count(t.id)::int as total_assigned
         from agents a
         left join tickets t on t.assigned_agent_id = a.id
         where a.role = 'agent'
         group by a.id, a.name, a.current_workload
         order by a.name asc`
      ),
      pool.query(
        `select
           count(*)::int as total_tickets,
           count(*) filter (where status = 'open')::int as open_count,
           count(*) filter (where status = 'in_progress')::int as in_progress_count,
           count(*) filter (where status = 'resolved')::int as resolved_count
         from tickets`
      ),
      pool.query(
        `select sla_outcome as outcome, count(*)::int as count,
                count(*) filter (where status != 'resolved')::int as active_count
         from tickets
         where sla_outcome is not null
         group by sla_outcome`
      ),
    ]);

    // Always return all four outcomes (zero-filled) in a fixed order for the chart.
    const slaOutcomes = SLA_OUTCOMES.map((outcome) => {
      const row = outcomes.rows.find((r) => r.outcome === outcome);
      return { outcome, count: row?.count ?? 0, activeCount: row?.active_count ?? 0 };
    });

    const totalWithSla = Number(breachRate.rows[0].total_with_sla) || 0;
    const breached = Number(breachRate.rows[0].breached) || 0;
    const breachPct = totalWithSla > 0 ? Math.round((breached / totalWithSla) * 1000) / 10 : 0;

    res.json({
      avgResolutionMinutes: Number(avgResolution.rows[0].avg_minutes) || 0,
      slaBreachPct: breachPct,
      slaBreachedCount: breached,
      slaTotalWithDeadline: totalWithSla,
      slaCurrentlyOverdue: breachRate.rows[0].currently_overdue,
      slaOutcomes,
      ticketsByCategory: byCategory.rows,
      ticketsByDay: byDay.rows,
      perAgentLoad: perAgent.rows,
      totals: totals.rows[0],
    });
  })
);
