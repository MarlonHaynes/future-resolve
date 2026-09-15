export type Role = "admin" | "agent";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type Priority = "low" | "med" | "high" | "urgent";
export type SlaOutcome = "escalated" | "auto_resolved" | "restarted" | "breached_final";

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: Role;
  current_workload: number;
  created_at: string;
}

export interface SlaPolicy {
  id: string;
  category: string;
  priority: Priority;
  response_minutes: number;
  resolution_minutes: number;
}

export interface KbArticle {
  id: string;
  title: string;
  body: string;
  category: string;
}

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  assigned_agent_id: string | null;
  sla_deadline: string | null;
  created_at: string;
  resolved_at: string | null;
  ai_reasoning: string | null;
  suggested_kb_article_id: string | null;
  classification_source: "gemini" | "mock" | null;
  sla_breach_logged: boolean;
  sla_outcome: SlaOutcome | null;
  sla_breach_count: number;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface ClassificationResult {
  category: string;
  priority: Priority;
  suggested_kb_article_id: string | null;
  reasoning: string;
  source: "gemini" | "mock";
}

export interface AuthTokenPayload {
  agentId: string;
  role: Role;
  email: string;
  name: string;
}
