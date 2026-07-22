import { pool } from "../db.js";
import { Priority } from "../types.js";

// ============================================================================
// SLA engine
//
// computeSlaDeadline: looks up the sla_policies row matching
// (category, priority). If a ticket's exact category has no policy row
// (e.g. a category Gemini invents that wasn't seeded), we fall back to the
// closest generic policy for that priority alone, and finally to a hardcoded
// safety-net default so a ticket is never left without a deadline.
//
// The background sweep (startSlaBreachSweep) periodically scans open tickets
// past their deadline and logs a single 'sla_breach' ticket_event the first
// time it notices — sla_breach_logged prevents duplicate escalation events.
// ============================================================================

const FALLBACK_RESOLUTION_MINUTES: Record<Priority, number> = {
  urgent: 60,
  high: 4 * 60,
  med: 24 * 60,
  low: 3 * 24 * 60,
};

export async function computeSlaDeadline(
  category: string,
  priority: Priority,
  createdAt: Date
): Promise<Date> {
  const exact = await pool.query(
    `select resolution_minutes from sla_policies where category = $1 and priority = $2`,
    [category, priority]
  );

  let resolutionMinutes: number;
  if (exact.rows[0]) {
    resolutionMinutes = exact.rows[0].resolution_minutes;
  } else {
    resolutionMinutes = FALLBACK_RESOLUTION_MINUTES[priority];
  }

  return new Date(createdAt.getTime() + resolutionMinutes * 60_000);
}

/** Runs one pass: finds newly-breached tickets and logs an escalation event for each. */
export async function sweepSlaBreaches(): Promise<number> {
  const { rows: breached } = await pool.query(
    `select id, sla_deadline from tickets
     where status != 'resolved'
       and sla_breach_logged = false
       and sla_deadline is not null
       and sla_deadline < now()`
  );

  for (const ticket of breached) {
    await pool.query(
      `insert into ticket_events (ticket_id, event_type, detail) values ($1, 'sla_breach', $2)`,
      [ticket.id, `SLA deadline of ${new Date(ticket.sla_deadline).toISOString()} was missed. Escalating.`]
    );
    await pool.query(`update tickets set sla_breach_logged = true where id = $1`, [ticket.id]);
  }

  return breached.length;
}

let sweepInterval: NodeJS.Timeout | null = null;

/** Starts the periodic breach sweep. Safe to call once at server boot. */
export function startSlaBreachSweep(intervalMs = 60_000) {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    sweepSlaBreaches().catch((err) => console.error("[sla] sweep failed:", err));
  }, intervalMs);
}
