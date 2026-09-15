import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { classifyTicket } from "../services/classifier.js";
import { computeSlaDeadline, handleSlaBreach } from "../services/sla.js";
import { decrementWorkload, incrementWorkload, pickLeastLoadedAgent } from "../services/routing.js";
import { Priority, TicketStatus } from "../types.js";

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

// ----------------------------------------------------------------------------
// GET /api/tickets — list + filter + paginate. Adds a computed `breached`
// boolean so the frontend doesn't need to duplicate the "past deadline and
// unresolved" logic.
//
// Query: status, category, priority, assignedAgentId, page (1-based), pageSize.
// Filters apply to the full table first; `total`, `openCount` and
// `breachedCount` always describe the whole filtered set, and only `tickets`
// is limited to the requested page. Omitting pageSize returns every match.
// ----------------------------------------------------------------------------
const MAX_PAGE_SIZE = 200;
const BREACHED_SQL = `(t.status != 'resolved' and t.sla_deadline is not null and t.sla_deadline < now())`;

ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, category, priority, assignedAgentId } = req.query;

    const clauses: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      clauses.push(`t.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`t.category = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      clauses.push(`t.priority = $${params.length}`);
    }
    if (assignedAgentId) {
      params.push(assignedAgentId);
      clauses.push(`t.assigned_agent_id = $${params.length}`);
    }

    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const summary = (
      await pool.query(
        `select count(*)::int as total,
                count(*) filter (where t.status = 'open')::int as open_count,
                count(*) filter (where ${BREACHED_SQL})::int as breached_count
         from tickets t
         ${where}`,
        params
      )
    ).rows[0];

    const requestedPageSize = Number.parseInt(String(req.query.pageSize ?? ""), 10);
    const paginated = Number.isFinite(requestedPageSize) && requestedPageSize > 0;
    const pageSize = paginated ? Math.min(requestedPageSize, MAX_PAGE_SIZE) : Math.max(summary.total, 1);
    const totalPages = Math.max(1, Math.ceil(summary.total / pageSize));
    const requestedPage = Number.parseInt(String(req.query.page ?? ""), 10);
    // clamp so e.g. narrowing a filter while on page 3 lands on the last real page
    const page = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);

    const { rows } = await pool.query(
      `select t.*, a.name as assigned_agent_name, ${BREACHED_SQL} as breached
       from tickets t
       left join agents a on a.id = t.assigned_agent_id
       ${where}
       order by t.created_at desc, t.id desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    res.json({
      tickets: rows,
      total: summary.total,
      openCount: summary.open_count,
      breachedCount: summary.breached_count,
      page,
      pageSize,
      totalPages,
    });
  })
);

// ----------------------------------------------------------------------------
// GET /api/tickets/:id — detail + event timeline + kb suggestion
// ----------------------------------------------------------------------------
ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `select t.*, a.name as assigned_agent_name,
              ${BREACHED_SQL} as breached
       from tickets t
       left join agents a on a.id = t.assigned_agent_id
       where t.id = $1`,
      [req.params.id]
    );
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const events = await pool.query(
      `select * from ticket_events where ticket_id = $1 order by created_at asc`,
      [req.params.id]
    );

    let kbArticle = null;
    if (ticket.suggested_kb_article_id) {
      const kb = await pool.query(`select * from kb_articles where id = $1`, [ticket.suggested_kb_article_id]);
      kbArticle = kb.rows[0] ?? null;
    }

    res.json({ ticket, events: events.rows, kbArticle });
  })
);

// ----------------------------------------------------------------------------
// POST /api/tickets — create, classify, compute SLA, auto-route.
// Body: { subject, body, useLiveAI?: boolean }
// useLiveAI is the one "Try live classification" path — it is opt-in per
// request and only fires a real Gemini call, never silently.
// ----------------------------------------------------------------------------
ticketsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { subject, body, useLiveAI } = req.body ?? {};
    if (!subject || !body) {
      return res.status(400).json({ error: "subject and body are required" });
    }

    const kbArticles = (await pool.query(`select * from kb_articles`)).rows;
    const classification = await classifyTicket(subject, body, kbArticles, Boolean(useLiveAI));

    const createdAt = new Date();
    const slaDeadline = await computeSlaDeadline(classification.category, classification.priority, createdAt);
    const assignedAgentId = await pickLeastLoadedAgent();

    const insert = await pool.query(
      `insert into tickets
        (subject, body, status, priority, category, assigned_agent_id, sla_deadline,
         ai_reasoning, suggested_kb_article_id, classification_source)
       values ($1, $2, 'open', $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        subject,
        body,
        classification.priority,
        classification.category,
        assignedAgentId,
        slaDeadline,
        classification.reasoning,
        classification.suggested_kb_article_id,
        classification.source,
      ]
    );
    const ticket = insert.rows[0];

    await pool.query(
      `insert into ticket_events (ticket_id, event_type, detail) values ($1, 'created', $2)`,
      [ticket.id, `Ticket created by ${req.user!.name}`]
    );
    await pool.query(
      `insert into ticket_events (ticket_id, event_type, detail) values ($1, 'classified', $2)`,
      [ticket.id, classification.reasoning]
    );

    if (assignedAgentId) {
      await incrementWorkload(assignedAgentId);
      await pool.query(
        `insert into ticket_events (ticket_id, event_type, detail) values ($1, 'assigned', $2)`,
        [ticket.id, `Auto-routed to least-loaded agent`]
      );
    }

    res.status(201).json({ ticket });
  })
);

// ----------------------------------------------------------------------------
// POST /api/tickets/:id/sla-check — called by the frontend the moment a live
// countdown hits 0. Applies the breach outcome right away (same handler as
// the background sweep, so it's idempotent and race-safe); a no-op if the
// ticket isn't actually due yet by the server's clock.
// ----------------------------------------------------------------------------
ticketsRouter.post(
  "/:id/sla-check",
  asyncHandler(async (req, res) => {
    const outcome = await handleSlaBreach(req.params.id);
    res.json({ outcome });
  })
);

// ----------------------------------------------------------------------------
// PATCH /api/tickets/:id — update status/priority/category/assignment.
// Handles workload increment/decrement on assignment changes and on
// resolve/reopen transitions, and logs an event per change.
// ----------------------------------------------------------------------------
ticketsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { status, priority, category, assigned_agent_id } = req.body as {
      status?: TicketStatus;
      priority?: Priority;
      category?: string;
      assigned_agent_id?: string | null;
    };

    const current = (await pool.query(`select * from tickets where id = $1`, [req.params.id])).rows[0];
    if (!current) return res.status(404).json({ error: "Ticket not found" });

    const updates: string[] = [];
    const params: any[] = [];

    if (status && status !== current.status) {
      params.push(status);
      updates.push(`status = $${params.length}`);

      if (status === "resolved" && current.status !== "resolved") {
        updates.push(`resolved_at = now()`);
        if (current.assigned_agent_id) await decrementWorkload(current.assigned_agent_id);
      }
      if (status !== "resolved" && current.status === "resolved") {
        updates.push(`resolved_at = null`);
        if (current.assigned_agent_id) await incrementWorkload(current.assigned_agent_id);
      }

      await pool.query(`insert into ticket_events (ticket_id, event_type, detail) values ($1, 'status_changed', $2)`, [
        req.params.id,
        `${current.status} -> ${status} by ${req.user!.name}`,
      ]);
    }

    if (priority && priority !== current.priority) {
      params.push(priority);
      updates.push(`priority = $${params.length}`);
      await pool.query(`insert into ticket_events (ticket_id, event_type, detail) values ($1, 'priority_changed', $2)`, [
        req.params.id,
        `${current.priority} -> ${priority} by ${req.user!.name}`,
      ]);
    }

    if (category && category !== current.category) {
      params.push(category);
      updates.push(`category = $${params.length}`);
    }

    if (assigned_agent_id !== undefined && assigned_agent_id !== current.assigned_agent_id) {
      params.push(assigned_agent_id);
      updates.push(`assigned_agent_id = $${params.length}`);

      const ticketIsActive = (status ?? current.status) !== "resolved";
      if (ticketIsActive) {
        if (current.assigned_agent_id) await decrementWorkload(current.assigned_agent_id);
        if (assigned_agent_id) await incrementWorkload(assigned_agent_id);
      }
      await pool.query(`insert into ticket_events (ticket_id, event_type, detail) values ($1, 'reassigned', $2)`, [
        req.params.id,
        `Reassigned by ${req.user!.name}`,
      ]);
    }

    if (updates.length === 0) {
      return res.json({ ticket: current });
    }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `update tickets set ${updates.join(", ")} where id = $${params.length} returning *`,
      params
    );

    res.json({ ticket: rows[0] });
  })
);

// ----------------------------------------------------------------------------
// DELETE /api/tickets/:id — admin only
// ----------------------------------------------------------------------------
ticketsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const current = (await pool.query(`select * from tickets where id = $1`, [req.params.id])).rows[0];
    if (!current) return res.status(404).json({ error: "Ticket not found" });

    if (current.status !== "resolved" && current.assigned_agent_id) {
      await decrementWorkload(current.assigned_agent_id);
    }
    await pool.query(`delete from tickets where id = $1`, [req.params.id]);
    res.status(204).send();
  })
);
