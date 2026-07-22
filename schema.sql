-- ============================================================================
-- Future Resolve — PostgreSQL schema (Supabase-compatible)
-- Run with: psql "$DATABASE_URL" -f schema.sql
-- or via the npm script:  npm run migrate
-- ============================================================================

create extension if not exists pgcrypto; -- gives us gen_random_uuid()

-- ----------------------------------------------------------------------------
-- agents: support staff. `role` drives RBAC (admin vs agent).
-- password_hash backs the demo JWT login — not part of the original spec's
-- data model, but required for any auth to function; hashed with bcrypt.
-- ----------------------------------------------------------------------------
create table if not exists agents (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null unique,
  password_hash    text not null,
  role             text not null check (role in ('admin', 'agent')),
  current_workload int not null default 0,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- sla_policies: response/resolution targets per category+priority pair.
-- The SLA engine looks up the matching row when a ticket is created/classified.
-- ----------------------------------------------------------------------------
create table if not exists sla_policies (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null,
  priority           text not null check (priority in ('low', 'med', 'high', 'urgent')),
  response_minutes   int not null,
  resolution_minutes int not null,
  unique (category, priority)
);

-- ----------------------------------------------------------------------------
-- kb_articles: knowledge base, referenced by AI classification suggestions.
-- ----------------------------------------------------------------------------
create table if not exists kb_articles (
  id       uuid primary key default gen_random_uuid(),
  title    text not null,
  body     text not null,
  category text not null
);

-- ----------------------------------------------------------------------------
-- tickets
-- ----------------------------------------------------------------------------
create table if not exists tickets (
  id                       uuid primary key default gen_random_uuid(),
  subject                  text not null,
  body                     text not null,
  status                   text not null default 'open'
                             check (status in ('open', 'in_progress', 'resolved')),
  priority                 text not null check (priority in ('low', 'med', 'high', 'urgent')),
  category                 text not null,
  assigned_agent_id        uuid references agents(id) on delete set null,
  sla_deadline             timestamptz,
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz,

  -- AI classification transparency fields
  ai_reasoning             text,
  suggested_kb_article_id  uuid references kb_articles(id) on delete set null,
  classification_source    text check (classification_source in ('gemini', 'mock')),

  -- set once, the first time a breach escalation event is logged, so the
  -- background SLA sweep never double-logs the same breach
  sla_breach_logged        boolean not null default false
);

create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_category on tickets(category);
create index if not exists idx_tickets_priority on tickets(priority);
create index if not exists idx_tickets_assigned_agent on tickets(assigned_agent_id);
create index if not exists idx_tickets_created_at on tickets(created_at);

-- ----------------------------------------------------------------------------
-- ticket_events: append-only audit trail (created, classified, assigned,
-- status_changed, sla_breach, resolved, ...)
-- ----------------------------------------------------------------------------
create table if not exists ticket_events (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references tickets(id) on delete cascade,
  event_type text not null,
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_events_ticket_id on ticket_events(ticket_id);
