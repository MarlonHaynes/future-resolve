import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { env } from "../env.js";
import { classifyWithMockRules } from "../services/classifier.js";
import { CATEGORIES, PRIORITIES } from "../services/categories.js";
import { AGENTS, ADMIN, DEMO_PASSWORD, KB_ARTICLES, TEMPLATES } from "./data.js";
import { Priority } from "../types.js";

// ============================================================================
// Seed script — populates ~60 realistic, already-classified tickets, 5 agents
// + 1 admin, sla_policies for every category/priority pair, and 8 kb
// articles, spread across the last 14 days. No live Gemini calls are made:
// every ticket is classified with the exact same classifyWithMockRules()
// used at runtime, so the "AI reasoning" shown in the UI is real output.
//
// Run with: npm run seed  (from repo root) or `npm run seed -w server`
// ============================================================================

const TICKET_COUNT = 60;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// Base SLA minutes by priority; scaled per category below.
const BASE_SLA_MINUTES: Record<Priority, { response: number; resolution: number }> = {
  urgent: { response: 15, resolution: 60 },
  high: { response: 60, resolution: 240 },
  med: { response: 240, resolution: 1440 },
  low: { response: 480, resolution: 4320 },
};

// Some categories are handled faster (e.g. Account Access lockouts) or
// slower (e.g. Feature Request) than the baseline — purely for demo realism.
const CATEGORY_MULTIPLIER: Record<string, number> = {
  Billing: 1.0,
  "Technical Issue": 0.8,
  "Account Access": 0.7,
  "Shipping & Delivery": 1.0,
  "Feature Request": 1.5,
  "Bug Report": 0.9,
  "General Inquiry": 1.3,
};

function randomBetween(minMs: number, maxMs: number) {
  return new Date(minMs + Math.random() * (maxMs - minMs));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  if (!env.isDatabaseConfigured) {
    console.error(
      "DATABASE_URL is not configured. Copy .env.example to .env (and server/.env) and set a real Postgres connection string before seeding."
    );
    process.exit(1);
  }

  console.log("Clearing existing demo data...");
  await pool.query("truncate table ticket_events, tickets, kb_articles, sla_policies, agents cascade");

  console.log("Inserting SLA policies...");
  const slaPolicies: { category: string; priority: Priority; response_minutes: number; resolution_minutes: number }[] = [];
  for (const category of CATEGORIES) {
    for (const priority of PRIORITIES) {
      const base = BASE_SLA_MINUTES[priority];
      const mult = CATEGORY_MULTIPLIER[category] ?? 1;
      slaPolicies.push({
        category,
        priority,
        response_minutes: Math.round(base.response * mult),
        resolution_minutes: Math.round(base.resolution * mult),
      });
    }
  }
  for (const p of slaPolicies) {
    await pool.query(
      `insert into sla_policies (category, priority, response_minutes, resolution_minutes) values ($1,$2,$3,$4)`,
      [p.category, p.priority, p.response_minutes, p.resolution_minutes]
    );
  }

  console.log("Inserting KB articles...");
  const kbArticles: { id: string; category: string }[] = [];
  for (const article of KB_ARTICLES) {
    const { rows } = await pool.query(
      `insert into kb_articles (title, body, category) values ($1,$2,$3) returning id, category`,
      [article.title, article.body, article.category]
    );
    kbArticles.push(rows[0]);
  }

  console.log("Inserting agents...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const agentIds: string[] = [];
  const workload: Record<string, number> = {};

  for (const agent of AGENTS) {
    const { rows } = await pool.query(
      `insert into agents (name, email, password_hash, role) values ($1,$2,$3,$4) returning id`,
      [agent.name, agent.email, passwordHash, agent.role]
    );
    agentIds.push(rows[0].id);
    workload[rows[0].id] = 0;
  }
  await pool.query(`insert into agents (name, email, password_hash, role) values ($1,$2,$3,$4)`, [
    ADMIN.name,
    ADMIN.email,
    passwordHash,
    ADMIN.role,
  ]);

  console.log(`Generating ${TICKET_COUNT} demo tickets...`);

  // Build a category draw list so all 7 categories are represented roughly evenly.
  const categoryDraws: string[] = [];
  while (categoryDraws.length < TICKET_COUNT) {
    for (const c of CATEGORIES) {
      if (categoryDraws.length < TICKET_COUNT) categoryDraws.push(c);
    }
  }

  const now = Date.now();

  for (let i = 0; i < TICKET_COUNT; i++) {
    const category = categoryDraws[i];
    const template = pick(TEMPLATES[category]);

    // classify with the real mock classifier so reasoning/priority/kb
    // suggestion are authentic, not hand-authored
    const kbForClassifier = kbArticles.map((a) => ({ id: a.id, category: a.category })) as any;
    const classification = classifyWithMockRules(template.subject, template.body, kbForClassifier);

    const createdAt = randomBetween(now - FOURTEEN_DAYS_MS, now - 5 * 60 * 1000);

    const policy = slaPolicies.find(
      (p) => p.category === classification.category && p.priority === classification.priority
    )!;
    const slaDeadline = new Date(createdAt.getTime() + policy.resolution_minutes * 60_000);

    // status distribution: 40% resolved, 25% in_progress, 35% open
    const roll = Math.random();
    const status = roll < 0.4 ? "resolved" : roll < 0.65 ? "in_progress" : "open";

    // least-loaded agent among the local running workload tally
    const assignedAgentId = agentIds.reduce((leastId, id) =>
      workload[id] < workload[leastId] ? id : leastId
    );

    let resolvedAt: Date | null = null;
    let breached = false;

    if (status === "resolved") {
      // 80% resolved within SLA, 20% resolved late (breach)
      const withinSla = Math.random() < 0.8;
      const maxResolutionMs = policy.resolution_minutes * 60_000;
      const resolutionOffsetMs = withinSla
        ? Math.random() * maxResolutionMs * 0.9
        : maxResolutionMs * (1.05 + Math.random() * 0.5);
      resolvedAt = new Date(createdAt.getTime() + resolutionOffsetMs);
      if (resolvedAt.getTime() > now) resolvedAt = new Date(now); // never resolve in the future
      breached = resolvedAt.getTime() > slaDeadline.getTime();
      // resolved tickets don't hold a workload slot
    } else {
      workload[assignedAgentId] += 1;
      breached = slaDeadline.getTime() < now;
    }

    const { rows } = await pool.query(
      `insert into tickets
        (subject, body, status, priority, category, assigned_agent_id, sla_deadline, created_at,
         resolved_at, ai_reasoning, suggested_kb_article_id, classification_source, sla_breach_logged)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id`,
      [
        template.subject,
        template.body,
        status,
        classification.priority,
        classification.category,
        assignedAgentId,
        slaDeadline,
        createdAt,
        resolvedAt,
        classification.reasoning,
        classification.suggested_kb_article_id,
        classification.source,
        breached,
      ]
    );
    const ticketId = rows[0].id;

    const events: { type: string; detail: string; at: Date }[] = [
      { type: "created", detail: "Ticket submitted", at: createdAt },
      { type: "classified", detail: classification.reasoning, at: new Date(createdAt.getTime() + 30_000) },
      { type: "assigned", detail: "Auto-routed to least-loaded agent", at: new Date(createdAt.getTime() + 45_000) },
    ];

    if (status !== "open") {
      events.push({
        type: "status_changed",
        detail: `open -> in_progress`,
        at: new Date(createdAt.getTime() + 10 * 60_000),
      });
    }
    if (status === "resolved" && resolvedAt) {
      events.push({ type: "status_changed", detail: "in_progress -> resolved", at: resolvedAt });
    }
    if (breached) {
      events.push({
        type: "sla_breach",
        detail: `SLA deadline of ${slaDeadline.toISOString()} was missed. Escalating.`,
        at: status === "resolved" && resolvedAt ? resolvedAt : new Date(Math.min(slaDeadline.getTime() + 60_000, now)),
      });
    }

    for (const e of events) {
      await pool.query(
        `insert into ticket_events (ticket_id, event_type, detail, created_at) values ($1,$2,$3,$4)`,
        [ticketId, e.type, e.detail, e.at]
      );
    }
  }

  // Persist final workload counts (in case rounding/order drifted from the running tally)
  for (const id of agentIds) {
    await pool.query(`update agents set current_workload = $1 where id = $2`, [workload[id], id]);
  }

  console.log("Seed complete.");
  console.log("");
  console.log("Demo login credentials (all use the same password):");
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Admin:    ${ADMIN.email}`);
  for (const a of AGENTS) console.log(`  Agent:    ${a.email}`);
  console.log("");

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
