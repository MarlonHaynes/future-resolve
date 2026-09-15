import { pool } from "../db.js";
import { Priority, SlaOutcome } from "../types.js";
import { Db, decrementWorkload, incrementWorkload, pickLeastLoadedAgent } from "./routing.js";

// ============================================================================
// SLA engine
//
// computeSlaDeadline: looks up the sla_policies row matching
// (category, priority). If a ticket's exact category has no policy row
// (e.g. a category Gemini invents that wasn't seeded), we fall back to a
// hardcoded per-priority default so a ticket is never left without a deadline.
//
// The background sweep (startSlaBreachSweep) periodically scans unresolved
// tickets past their deadline and hands each one to handleSlaBreach(), which
// logs an 'sla_breach' event and then applies exactly one breach outcome.
// The same handler also backs POST /api/tickets/:id/sla-check, which the
// frontend calls the moment a live countdown hits 0 so the outcome shows up
// immediately instead of on the next sweep tick.
// ============================================================================

// ============================================================================
// SLA BREACH OUTCOME RULES
//
// When a ticket's SLA clock hits 0 it does not just sit in "Breached". The
// engine picks one of four outcomes:
//
//   escalated       Priority bumps up one level (low -> med -> high -> urgent;
//                   urgent stays urgent), the ticket is reassigned to the
//                   least-loaded *other* agent, and the SLA clock restarts
//                   with a shorter escalated deadline: the resolution target
//                   for the NEW priority x ESCALATION_DEADLINE_FACTOR (50%).
//
//   auto_resolved   The ticket is marked resolved automatically (auto-close
//                   of a stale ticket). LOW PRIORITY ONLY — anything more
//                   important is never silently closed.
//
//   restarted       The SLA clock restarts from the beginning (full
//                   resolution target for the current priority), simulating
//                   a customer follow-up resetting the timer. Priority,
//                   assignee and status are unchanged.
//
//   breached_final  No further action: the ticket stays in the
//                   "Breached — overdue" state until a human deals with it.
//
// Choosing an outcome — deterministic but varied:
//   * roll = FNV-1a hash of "<ticket id>:<breach count>" mod 100. The same
//     ticket at the same breach count always gets the same outcome (stable
//     across sweeps, restarts, and the seed script), but different tickets
//     spread across the weights below. Including the breach count means a
//     ticket that breaches again after an escalation/restart re-rolls.
//   * The roll is mapped onto per-priority weights (OUTCOME_WEIGHTS, each row
//     sums to 100). Higher priorities lean toward escalation; low priority is
//     the only row with auto_resolved.
//   * Cap: once a ticket has been escalated/restarted MAX_SLA_ACTIONS times,
//     its next breach is always breached_final, so no ticket can bounce
//     through escalations/restarts forever.
//
// Only escalated and restarted put a fresh deadline on the ticket, so they
// reset sla_breach_logged = false (the next breach is handled again).
// auto_resolved and breached_final are terminal and leave it true.
// sla_outcome always holds the most recent outcome; sla_breach_count counts
// how many breaches the engine has handled for the ticket.
// ============================================================================

export const OUTCOME_WEIGHTS: Record<Priority, [SlaOutcome, number][]> = {
  low: [
    ["auto_resolved", 40],
    ["restarted", 25],
    ["escalated", 15],
    ["breached_final", 20],
  ],
  med: [
    ["escalated", 40],
    ["restarted", 30],
    ["breached_final", 30],
  ],
  high: [
    ["escalated", 50],
    ["restarted", 25],
    ["breached_final", 25],
  ],
  urgent: [
    ["escalated", 40],
    ["restarted", 25],
    ["breached_final", 35],
  ],
};

export const ESCALATION_DEADLINE_FACTOR = 0.5;
export const MAX_SLA_ACTIONS = 2;

const PRIORITY_ORDER: Priority[] = ["low", "med", "high", "urgent"];

const FALLBACK_RESOLUTION_MINUTES: Record<Priority, number> = {
  urgent: 60,
  high: 4 * 60,
  med: 24 * 60,
  low: 3 * 24 * 60,
};

/** 32-bit FNV-1a — tiny, fast, and identical on every run/platform. */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Pure: which outcome a ticket gets for its Nth breach (breachCount = breaches already handled). */
export function decideSlaOutcome(ticketId: string, priority: Priority, breachCount: number): SlaOutcome {
  if (breachCount >= MAX_SLA_ACTIONS) return "breached_final";
  const roll = stableHash(`${ticketId}:${breachCount}`) % 100;
  let cumulative = 0;
  for (const [outcome, weight] of OUTCOME_WEIGHTS[priority]) {
    cumulative += weight;
    if (roll < cumulative) return outcome;
  }
  return "breached_final";
}

export function escalatePriority(priority: Priority): Priority {
  return PRIORITY_ORDER[Math.min(PRIORITY_ORDER.indexOf(priority) + 1, PRIORITY_ORDER.length - 1)];
}

export function deadlineFrom(start: Date, resolutionMinutes: number): Date {
  return new Date(start.getTime() + Math.round(resolutionMinutes) * 60_000);
}

export async function getResolutionMinutes(category: string, priority: Priority, db: Db = pool): Promise<number> {
  const exact = await db.query(
    `select resolution_minutes from sla_policies where category = $1 and priority = $2`,
    [category, priority]
  );
  return exact.rows[0]?.resolution_minutes ?? FALLBACK_RESOLUTION_MINUTES[priority];
}

export async function computeSlaDeadline(category: string, priority: Priority, createdAt: Date): Promise<Date> {
  return deadlineFrom(createdAt, await getResolutionMinutes(category, priority));
}

// A ticket is due for breach handling when it's unresolved, past its
// deadline, and the engine hasn't already handled this particular deadline.
const BREACH_DUE_SQL = `status != 'resolved'
  and sla_breach_logged = false
  and sla_deadline is not null
  and sla_deadline < now()`;

async function agentName(db: Db, agentId: string | null): Promise<string> {
  if (!agentId) return "Unassigned";
  const { rows } = await db.query(`select name from agents where id = $1`, [agentId]);
  return rows[0]?.name ?? "Unknown agent";
}

async function logEvent(db: Db, ticketId: string, type: string, detail: string) {
  await db.query(`insert into ticket_events (ticket_id, event_type, detail) values ($1, $2, $3)`, [
    ticketId,
    type,
    detail,
  ]);
}

/**
 * Applies the breach outcome for one ticket, if (and only if) it is due.
 * Runs in a transaction with `for update skip locked`, so the sweep and the
 * per-ticket sla-check endpoint can race without double-handling a breach.
 * Returns the outcome applied, or null if the ticket wasn't due.
 */
export async function handleSlaBreach(ticketId: string): Promise<SlaOutcome | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `select * from tickets where id = $1 and ${BREACH_DUE_SQL} for update skip locked`,
      [ticketId]
    );
    const ticket = rows[0];
    if (!ticket) {
      await client.query("rollback");
      return null;
    }

    const now = new Date();
    const outcome = decideSlaOutcome(ticket.id, ticket.priority, ticket.sla_breach_count);

    await logEvent(
      client,
      ticket.id,
      "sla_breach",
      `SLA deadline of ${new Date(ticket.sla_deadline).toISOString()} was missed.`
    );

    if (outcome === "escalated") {
      const newPriority = escalatePriority(ticket.priority);
      const oldAgentId: string | null = ticket.assigned_agent_id;
      const newAgentId = (await pickLeastLoadedAgent(oldAgentId, client)) ?? oldAgentId;
      const minutes = await getResolutionMinutes(ticket.category, newPriority, client);
      const newDeadline = deadlineFrom(now, minutes * ESCALATION_DEADLINE_FACTOR);

      if (newAgentId !== oldAgentId) {
        if (oldAgentId) await decrementWorkload(oldAgentId, client);
        if (newAgentId) await incrementWorkload(newAgentId, client);
      }
      await client.query(
        `update tickets set priority = $2, assigned_agent_id = $3, sla_deadline = $4,
           sla_breach_logged = false, sla_outcome = 'escalated', sla_breach_count = sla_breach_count + 1
         where id = $1`,
        [ticket.id, newPriority, newAgentId, newDeadline]
      );
      const priorityText =
        newPriority === ticket.priority ? `priority stays ${newPriority} (already highest)` : `priority ${ticket.priority} -> ${newPriority}`;
      await logEvent(
        client,
        ticket.id,
        "sla_escalated",
        `Escalated: ${priorityText}, reassigned ${await agentName(client, oldAgentId)} -> ${await agentName(client, newAgentId)}. Escalated deadline ${newDeadline.toISOString()}.`
      );
    } else if (outcome === "restarted") {
      const minutes = await getResolutionMinutes(ticket.category, ticket.priority, client);
      const newDeadline = deadlineFrom(now, minutes);
      await client.query(
        `update tickets set sla_deadline = $2, sla_breach_logged = false,
           sla_outcome = 'restarted', sla_breach_count = sla_breach_count + 1
         where id = $1`,
        [ticket.id, newDeadline]
      );
      await logEvent(
        client,
        ticket.id,
        "sla_restarted",
        `Customer follow-up received — SLA clock restarted. New deadline ${newDeadline.toISOString()}.`
      );
    } else if (outcome === "auto_resolved") {
      if (ticket.assigned_agent_id) await decrementWorkload(ticket.assigned_agent_id, client);
      await client.query(
        `update tickets set status = 'resolved', resolved_at = now(), sla_breach_logged = true,
           sla_outcome = 'auto_resolved', sla_breach_count = sla_breach_count + 1
         where id = $1`,
        [ticket.id]
      );
      await logEvent(client, ticket.id, "sla_auto_resolved", `Stale low-priority ticket auto-closed: ${ticket.status} -> resolved.`);
    } else {
      await client.query(
        `update tickets set sla_breach_logged = true, sla_outcome = 'breached_final',
           sla_breach_count = sla_breach_count + 1
         where id = $1`,
        [ticket.id]
      );
      await logEvent(client, ticket.id, "sla_breached_final", "No automatic action — ticket remains overdue.");
    }

    await client.query("commit");
    return outcome;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Runs one pass: applies a breach outcome to every ticket that's newly past its deadline. */
export async function sweepSlaBreaches(): Promise<number> {
  const { rows } = await pool.query(`select id from tickets where ${BREACH_DUE_SQL} order by sla_deadline asc`);
  let handled = 0;
  for (const { id } of rows) {
    if (await handleSlaBreach(id)) handled++;
  }
  return handled;
}

let sweepInterval: NodeJS.Timeout | null = null;

/** Starts the periodic breach sweep (and runs one pass immediately). Safe to call once at server boot. */
export function startSlaBreachSweep(intervalMs = 15_000) {
  if (sweepInterval) return;
  const run = () =>
    sweepSlaBreaches()
      .then((n) => {
        if (n > 0) console.log(`[sla] handled ${n} breached ticket(s)`);
      })
      .catch((err) => console.error("[sla] sweep failed:", err));
  run();
  sweepInterval = setInterval(run, intervalMs);
}
