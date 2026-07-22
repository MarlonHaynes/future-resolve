import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireRole("admin"));

analyticsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [avgResolution, breachRate, byCategory, byDay, perAgent, totals] = await Promise.all([
      pool.query(
        `select avg(extract(epoch from (resolved_at - created_at)) / 60)::numeric(10,1) as avg_minutes
         from tickets where resolved_at is not null`
      ),
      pool.query(
        `select
           count(*) filter (where sla_deadline is not null) as total_with_sla,
           count(*) filter (
             where sla_deadline is not null and (
               (resolved_at is not null and resolved_at > sla_deadline) or
               (resolved_at is null and sla_deadline < now())
             )
           ) as breached
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
                count(t.id) filter (where t.status = 'resolved')::int as resolved_count,
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
    ]);

    const totalWithSla = Number(breachRate.rows[0].total_with_sla) || 0;
    const breached = Number(breachRate.rows[0].breached) || 0;
    const breachPct = totalWithSla > 0 ? Math.round((breached / totalWithSla) * 1000) / 10 : 0;

    res.json({
      avgResolutionMinutes: Number(avgResolution.rows[0].avg_minutes) || 0,
      slaBreachPct: breachPct,
      slaBreachedCount: breached,
      slaTotalWithDeadline: totalWithSla,
      ticketsByCategory: byCategory.rows,
      ticketsByDay: byDay.rows,
      perAgentLoad: perAgent.rows,
      totals: totals.rows[0],
    });
  })
);
