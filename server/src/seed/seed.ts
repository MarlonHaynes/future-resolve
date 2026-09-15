import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { env } from "../env.js";
import { CATEGORIES, PRIORITIES } from "../services/categories.js";
import { AGENTS, ADMIN, DEMO_PASSWORD, KB_ARTICLES } from "./data.js";
import { Priority } from "../types.js";
import { SeedPolicy, buildTickets, summarizeTickets } from "./buildTickets.js";

// ============================================================================
// Seed script — populates 140 realistic, already-classified tickets, 5 agents
// + 1 admin, sla_policies for every category/priority pair, and 8 kb
// articles, spread across the last 14 days. Ticket generation (including
// replaying each ticket's SLA breach outcomes) lives in buildTickets.ts.
// No live Gemini calls are made: every ticket is classified with the exact same classifyWithMockRules()
// used at runtime, so the "AI reasoning" shown in the UI is real output.
//
// Run with: npm run seed  (from repo root) or `npm run seed -w server`
// ============================================================================

const TICKET_COUNT = 140;

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

/** Multi-row insert in chunks, keeping each statement well under Postgres' 65535-parameter limit. */
async function insertRows(table: string, columns: string[], rows: unknown[][], chunkSize = 250) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await pool.query(`insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")}`, params);
  }
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
  const slaPolicies: SeedPolicy[] = [];
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

  for (const agent of AGENTS) {
    const { rows } = await pool.query(
      `insert into agents (name, email, password_hash, role) values ($1,$2,$3,$4) returning id`,
      [agent.name, agent.email, passwordHash, agent.role]
    );
    agentIds.push(rows[0].id);
  }
  await pool.query(`insert into agents (name, email, password_hash, role) values ($1,$2,$3,$4)`, [
    ADMIN.name,
    ADMIN.email,
    passwordHash,
    ADMIN.role,
  ]);

  console.log(`Generating ${TICKET_COUNT} demo tickets...`);
  const now = Date.now();
  const { tickets, events, workload } = buildTickets({
    count: TICKET_COUNT,
    now,
    agents: agentIds.map((id, i) => ({ id, name: AGENTS[i].name })),
    kbArticles,
    slaPolicies,
  });

  await insertRows(
    "tickets",
    [
      "id", "subject", "body", "status", "priority", "category", "assigned_agent_id", "sla_deadline",
      "created_at", "resolved_at", "ai_reasoning", "suggested_kb_article_id", "classification_source",
      "sla_breach_logged", "sla_outcome", "sla_breach_count",
    ],
    tickets.map((t) => [
      t.id, t.subject, t.body, t.status, t.priority, t.category, t.assigned_agent_id, t.sla_deadline,
      t.created_at, t.resolved_at, t.ai_reasoning, t.suggested_kb_article_id, t.classification_source,
      t.sla_breach_logged, t.sla_outcome, t.sla_breach_count,
    ])
  );

  console.log(`Inserting ${events.length} ticket events...`);
  await insertRows(
    "ticket_events",
    ["ticket_id", "event_type", "detail", "created_at"],
    events.map((e) => [e.ticket_id, e.event_type, e.detail, e.created_at])
  );

  // Persist final workload counts from the generator's running tally
  for (const id of agentIds) {
    await pool.query(`update agents set current_workload = $1 where id = $2`, [workload[id], id]);
  }

  console.log("Seed complete. Ticket mix:");
  for (const [label, counts] of Object.entries(summarizeTickets(tickets, now))) {
    console.log(`  ${label.padEnd(10)} ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }
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
