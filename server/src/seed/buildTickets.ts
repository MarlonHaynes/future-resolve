import { randomUUID } from "node:crypto";
import { classifyWithMockRules } from "../services/classifier.js";
import { CATEGORIES } from "../services/categories.js";
import {
  ESCALATION_DEADLINE_FACTOR,
  deadlineFrom,
  decideSlaOutcome,
  escalatePriority,
} from "../services/sla.js";
import { Priority, SlaOutcome, TicketStatus } from "../types.js";
import { TEMPLATES } from "./data.js";

// ============================================================================
// Pure ticket generator for the seed script (no DB access), so seed.ts only
// has to insert what this returns.
//
// Each ticket's SLA history is replayed through the real outcome rules in
// services/sla.ts: whenever a simulated deadline passes before the ticket is
// resolved (or before "now"), decideSlaOutcome() picks what the engine would
// have done, exactly as the live sweep would. Ticket ids are generated here
// (not by Postgres) because the outcome roll is keyed on the id — so once
// seeded, the live sweep keeps making decisions consistent with this history.
//
// Getting a realistic mix: left to pure chance, almost every older unresolved
// ticket would have re-breached until it hit the MAX_SLA_ACTIONS cap and
// ended up breached_final. So each unresolved ticket first draws a target end
// state (TARGET_WEIGHTS), then we pick an id whose outcome roll produces that
// outcome and a created_at that puts "now" inside the right window (e.g. a
// few hours into an escalated deadline). The replay below still does the
// actual work — targeting only chooses inputs, it never overrides the rules.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_MS = 14 * DAY_MS;
const MIN_AGE_MS = 5 * 60_000;
const SWEEP_DELAY_MS = 30_000; // simulated gap between a deadline passing and the sweep handling it

// "countdown" = never breached, first SLA clock still running.
type Target = "countdown" | SlaOutcome;

// End-state mix for tickets that are NOT resolved by an agent. Only low
// priority can be auto-resolved, mirroring OUTCOME_WEIGHTS in sla.ts.
const TARGET_WEIGHTS: Record<"low" | "other", [Target, number][]> = {
  low: [
    ["countdown", 20],
    ["auto_resolved", 35],
    ["restarted", 15],
    ["escalated", 10],
    ["breached_final", 20],
  ],
  other: [
    ["countdown", 25],
    ["escalated", 25],
    ["restarted", 17],
    ["breached_final", 33],
  ],
};

function pickWeighted<T>(weights: [T, number][]): T {
  let roll = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of weights) {
    if ((roll -= weight) < 0) return value;
  }
  return weights[weights.length - 1][0];
}

export interface SeedPolicy {
  category: string;
  priority: Priority;
  response_minutes: number;
  resolution_minutes: number;
}

export interface SeedTicket {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  assigned_agent_id: string;
  sla_deadline: Date;
  created_at: Date;
  resolved_at: Date | null;
  ai_reasoning: string;
  suggested_kb_article_id: string | null;
  classification_source: "gemini" | "mock";
  sla_breach_logged: boolean;
  sla_outcome: SlaOutcome | null;
  sla_breach_count: number;
}

export interface SeedEvent {
  ticket_id: string;
  event_type: string;
  detail: string;
  created_at: Date;
}

export interface BuildInput {
  count: number;
  now: number;
  agents: { id: string; name: string }[];
  kbArticles: { id: string; category: string }[];
  slaPolicies: SeedPolicy[];
}

function randomBetween(minMs: number, maxMs: number) {
  return new Date(minMs + Math.random() * (maxMs - minMs));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildTickets({ count, now, agents, kbArticles, slaPolicies }: BuildInput) {
  const tickets: SeedTicket[] = [];
  const events: SeedEvent[] = [];
  const workload: Record<string, number> = Object.fromEntries(agents.map((a) => [a.id, 0]));
  const nameOf = (id: string) => agents.find((a) => a.id === id)!.name;

  const resolutionMinutes = (category: string, priority: Priority) =>
    slaPolicies.find((p) => p.category === category && p.priority === priority)!.resolution_minutes;

  // least-loaded agent by the running tally, optionally excluding one (for escalation)
  const leastLoaded = (excludeId?: string) =>
    agents
      .map((a) => a.id)
      .filter((id) => id !== excludeId)
      .reduce((leastId, id) => (workload[id] < workload[leastId] ? id : leastId));

  // Build a category draw list so all 7 categories are represented roughly evenly.
  const categoryDraws: string[] = [];
  while (categoryDraws.length < count) {
    for (const c of CATEGORIES) {
      if (categoryDraws.length < count) categoryDraws.push(c);
    }
  }

  for (let i = 0; i < count; i++) {
    let id = randomUUID();
    const category = categoryDraws[i];
    const template = pick(TEMPLATES[category]);

    // classify with the real mock classifier so reasoning/priority/kb
    // suggestion are authentic, not hand-authored
    const classification = classifyWithMockRules(template.subject, template.body, kbArticles as any);

    // status distribution: 35% agent-resolved, 25% in_progress, 40% open.
    // Low-priority auto-resolves then move a few open/in-progress tickets to
    // resolved, landing the final spread at roughly 40 / 25 / 35.
    const roll = Math.random();
    let status: TicketStatus = roll < 0.35 ? "resolved" : roll < 0.6 ? "in_progress" : "open";
    const plannedStatus = status;

    let priority = classification.priority;
    const baseMs = resolutionMinutes(category, priority) * 60_000;
    let createdAt: Date;

    if (status === "resolved") {
      // agent-resolved tickets are spread evenly over the last 14 days
      createdAt = randomBetween(now - HISTORY_MS, now - MIN_AGE_MS);
    } else {
      const target = pickWeighted(TARGET_WEIGHTS[priority === "low" ? "low" : "other"]);
      if (target === "countdown") {
        createdAt = randomBetween(now - baseMs * 0.9, now - MIN_AGE_MS);
      } else {
        // every target outcome has >= 10% weight for this priority, so this loop is short
        while (decideSlaOutcome(id, priority, 0) !== target) id = randomUUID();

        // how long ago the first breach was handled
        let sinceBreachMs: number;
        if (target === "escalated") {
          const escalatedMs = resolutionMinutes(category, escalatePriority(priority)) * ESCALATION_DEADLINE_FACTOR * 60_000;
          sinceBreachMs = Math.random() * escalatedMs * 0.95; // escalated clock still running
        } else if (target === "restarted") {
          sinceBreachMs = Math.random() * baseMs * 0.95; // restarted clock still running
        } else {
          // breached_final / auto_resolved: anywhere from minutes to ~two weeks
          // ago, squared so recent breaches are more common than ancient ones
          sinceBreachMs = Math.random() ** 2 * (HISTORY_MS - baseMs - SWEEP_DELAY_MS - MIN_AGE_MS);
        }
        createdAt = new Date(now - baseMs - SWEEP_DELAY_MS - sinceBreachMs);
      }
    }

    let agentId = leastLoaded();
    let deadline = deadlineFrom(createdAt, resolutionMinutes(category, priority));
    const at = (ms: number) => new Date(Math.min(ms, now));

    let resolvedAt: Date | null = null;
    if (status === "resolved") {
      // 80% resolved within SLA, 20% resolved late (breach)
      const withinSla = Math.random() < 0.8;
      const maxResolutionMs = resolutionMinutes(category, priority) * 60_000;
      const resolutionOffsetMs = withinSla
        ? Math.random() * maxResolutionMs * 0.9
        : maxResolutionMs * (1.05 + Math.random() * 0.5);
      resolvedAt = at(createdAt.getTime() + resolutionOffsetMs); // never resolve in the future
    }

    const ticketEvents: Omit<SeedEvent, "ticket_id">[] = [
      { event_type: "created", detail: "Ticket submitted", created_at: createdAt },
      { event_type: "classified", detail: classification.reasoning, created_at: at(createdAt.getTime() + 30_000) },
      {
        event_type: "assigned",
        detail: "Auto-routed to least-loaded agent",
        created_at: at(createdAt.getTime() + 45_000),
      },
    ];
    if (status !== "open") {
      ticketEvents.push({
        event_type: "status_changed",
        detail: "open -> in_progress",
        created_at: at(createdAt.getTime() + 10 * 60_000),
      });
    }

    // Replay the SLA engine: every deadline that passed before the ticket was
    // resolved (or before now, if still unresolved) gets a breach outcome.
    let breachCount = 0;
    let outcome: SlaOutcome | null = null;
    let breachLogged = false;
    const horizon = resolvedAt ? resolvedAt.getTime() : now;

    while (deadline.getTime() < horizon) {
      const breachAt = at(deadline.getTime() + SWEEP_DELAY_MS);
      ticketEvents.push({
        event_type: "sla_breach",
        detail: `SLA deadline of ${deadline.toISOString()} was missed.`,
        created_at: breachAt,
      });
      outcome = decideSlaOutcome(id, priority, breachCount);
      breachCount++;
      const outcomeAt = at(breachAt.getTime() + 1000);

      if (outcome === "escalated") {
        const newPriority = escalatePriority(priority);
        const newAgentId = leastLoaded(agentId);
        deadline = deadlineFrom(breachAt, resolutionMinutes(category, newPriority) * ESCALATION_DEADLINE_FACTOR);
        const priorityText =
          newPriority === priority ? `priority stays ${newPriority} (already highest)` : `priority ${priority} -> ${newPriority}`;
        ticketEvents.push({
          event_type: "sla_escalated",
          detail: `Escalated: ${priorityText}, reassigned ${nameOf(agentId)} -> ${nameOf(newAgentId)}. Escalated deadline ${deadline.toISOString()}.`,
          created_at: outcomeAt,
        });
        priority = newPriority;
        agentId = newAgentId;
      } else if (outcome === "restarted") {
        deadline = deadlineFrom(breachAt, resolutionMinutes(category, priority));
        ticketEvents.push({
          event_type: "sla_restarted",
          detail: `Customer follow-up received — SLA clock restarted. New deadline ${deadline.toISOString()}.`,
          created_at: outcomeAt,
        });
      } else if (outcome === "auto_resolved") {
        ticketEvents.push({
          event_type: "sla_auto_resolved",
          detail: `Stale low-priority ticket auto-closed: ${plannedStatus === "open" ? "open" : "in_progress"} -> resolved.`,
          created_at: outcomeAt,
        });
        status = "resolved";
        resolvedAt = outcomeAt;
        breachLogged = true;
        break;
      } else {
        ticketEvents.push({
          event_type: "sla_breached_final",
          detail: "No automatic action — ticket remains overdue.",
          created_at: outcomeAt,
        });
        breachLogged = true;
        break;
      }
    }

    if (plannedStatus === "resolved" && resolvedAt && outcome !== "auto_resolved") {
      ticketEvents.push({ event_type: "status_changed", detail: "in_progress -> resolved", created_at: resolvedAt });
    }
    // resolved tickets don't hold a workload slot
    if (status !== "resolved") workload[agentId] += 1;

    tickets.push({
      id,
      subject: template.subject,
      body: template.body,
      status,
      priority,
      category: classification.category,
      assigned_agent_id: agentId,
      sla_deadline: deadline,
      created_at: createdAt,
      resolved_at: resolvedAt,
      ai_reasoning: classification.reasoning,
      suggested_kb_article_id: classification.suggested_kb_article_id,
      classification_source: classification.source,
      sla_breach_logged: breachLogged,
      sla_outcome: outcome,
      sla_breach_count: breachCount,
    });

    ticketEvents
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .forEach((e) => events.push({ ticket_id: id, ...e }));
  }

  return { tickets, events, workload };
}

/** One-line-per-bucket summary printed at the end of seeding. */
export function summarizeTickets(tickets: SeedTicket[], now: number) {
  const tally = (fn: (t: SeedTicket) => string) =>
    tickets.reduce<Record<string, number>>((acc, t) => {
      const key = fn(t);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  return {
    status: tally((t) => t.status),
    priority: tally((t) => t.priority),
    slaOutcome: tally((t) => t.sla_outcome ?? "never breached"),
    slaState: tally((t) => {
      if (t.status === "resolved") return "resolved";
      const diffMs = t.sla_deadline.getTime() - now;
      if (diffMs >= 0) return "counting down";
      const overdueHours = -diffMs / 3_600_000;
      return overdueHours < 24 ? "overdue < 1d" : overdueHours < 72 ? "overdue 1-3d" : "overdue > 3d";
    }),
  };
}
