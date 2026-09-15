# Architecture

One page on the three pieces of logic worth understanding: SLA, routing, and
why classification calls a live LLM instead of a trained model.

## SLA engine

**Deadline calculation** (`server/src/services/sla.ts`, called from
`POST /api/tickets`): when a ticket is created, its `category` and
`priority` (from the classifier) are looked up in `sla_policies` for a
matching `(category, priority)` row, giving a `resolution_minutes` value.
`sla_deadline = created_at + resolution_minutes`. If no policy row matches
(e.g. a category the classifier invented that wasn't seeded), a hardcoded
per-priority fallback is used so a ticket is never left without a deadline.

**Live countdown**: the deadline is just a timestamp stored on the ticket —
there's no server-side "ticking" state. The frontend (`SlaCountdown.tsx`)
computes `deadline - now()` client-side and re-renders every second via
`setInterval`, coloring it green/amber/red as it approaches or passes zero.
This keeps the server stateless and cheap; the countdown is purely a
presentation-layer computation over one timestamp.

**Breach detection & escalation**: a ticket is "breached" if it's unresolved
and past its deadline (or was resolved after its deadline). This is computed
two ways for two different purposes:
1. **Read-time** (`GET /api/tickets`, `/api/tickets/:id`): a SQL boolean
   `breached` column is computed on every read (`sla_deadline < now() and
   status != 'resolved'`) — always accurate, no caching problems.
2. **Write-time escalation**: a background sweep (`startSlaBreachSweep` in
   `sla.ts`, a `setInterval` started at server boot) scans for tickets that
   just crossed their deadline and haven't been flagged yet
   (`sla_breach_logged = false`), inserts an `sla_breach` event into
   `ticket_events`, and applies one **breach outcome** in a transaction
   (`for update skip locked`, so a breach is never handled twice). This is
   what actually produces the audit-trail entries the timeline shows — the
   read-time boolean alone wouldn't create a persistent event.

**Breach outcomes**: instead of every overdue ticket looking the same, each
breach resolves to one of `escalated` (priority +1, reassigned to another
agent, shorter escalated deadline), `auto_resolved` (low priority only),
`restarted` (fresh full SLA clock), or `breached_final` (no action). The
choice is a hash of ticket id + breach count mapped onto per-priority
weights — stable for a given ticket, varied across tickets — and capped so
a ticket can't be escalated/restarted forever. The full rules are in the
comment block in `sla.ts`; the result is stored in `tickets.sla_outcome` /
`sla_breach_count`. When a countdown hits 0 on screen, the frontend calls
`POST /api/tickets/:id/sla-check` to apply the outcome immediately rather
than waiting for the next 15-second sweep. The seed script replays the same
rules over each seeded ticket's history.

A real deployment would replace the in-process `setInterval` with a proper
scheduled job (cron, Supabase Edge Function, etc.) since it only runs while
the Node process is alive; that swap doesn't change `sweepSlaBreaches()`
itself, just what calls it.

## Auto-routing

`server/src/services/routing.ts`: on ticket creation, `pickLeastLoadedAgent()`
selects the agent (role = `agent`, admins are excluded) with the lowest
`current_workload`, ties broken alphabetically for determinism.
`current_workload` is a plain counter — incremented when a ticket is
assigned to an agent while active, decremented when that ticket resolves (or
is reassigned/deleted). This makes workload balancing an O(1) lookup with no
need to recompute counts from the tickets table on every assignment.

**Simplification vs. the spec's exact wording** ("lowest current_workload in
that category"): the given `agents` table has no per-category specialization
column, so there's no data to route *within* a category — routing balances
load globally across all agents instead. If per-category routing pools are
needed later, the natural extension is an `agent_categories` join table and
filtering the `pickLeastLoadedAgent` query by it; the workload
increment/decrement logic wouldn't need to change.

Reassignment (`PATCH /api/tickets/:id`) and resolution both flow through the
same `incrementWorkload` / `decrementWorkload` helpers, so workload counts
stay correct regardless of which path changed the ticket — there's no
separate "recompute" step.

## Why a live LLM call instead of a trained classifier

Three reasons this app calls Gemini per-ticket rather than training/hosting
a classifier:

1. **Cold start.** A trained model needs labeled historical tickets before
   it's useful. A support desk's very first ticket has no training set to
   learn from. An LLM with a well-specified prompt (the fixed category list
   in `services/categories.ts`) works from ticket one, with zero training
   data or MLOps pipeline.
2. **Transparency requirement.** The spec requires the reasoning behind each
   classification to be *displayed*, not just the label. A traditional
   classifier (e.g. a fine-tuned BERT head) outputs a label and a confidence
   score — turning that into a human-readable explanation is itself a hard,
   separate problem. An LLM is asked directly for `reasoning` in its
   response and returns it as natural language for free.
3. **Taxonomy drift is cheap to handle.** If the category list changes
   (add "Security" as a category, split "Technical Issue" in two), a
   trained model needs retraining; the LLM prompt just needs the category
   list updated in one file.

**The trade-off** is latency, cost, and rate limits — which is why this app
does *not* call Gemini on every ticket. `classifyTicket()`
(`services/classifier.ts`) defaults to the offline mock rule-based
classifier (keyword matching against the same category/priority signals a
human triager would look for) for all ticket creation and all seed data.
The mock path is deterministic, instant, and free, and still produces a
`reasoning` string so the UI is never a black box even without AI. The one
`useLiveAI: true` path — wired to the single "Try live classification"
button — is the only code path that reaches `classifyWithGemini()`, keeping
real API usage opt-in and bounded to one call per click rather than one call
per ticket.
