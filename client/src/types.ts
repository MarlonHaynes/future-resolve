export type Role = "admin" | "agent";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type Priority = "low" | "med" | "high" | "urgent";

export interface AuthedAgent {
  agentId: string;
  role: Role;
  email: string;
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: Role;
  current_workload: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  assigned_agent_id: string | null;
  assigned_agent_name?: string | null;
  sla_deadline: string | null;
  created_at: string;
  resolved_at: string | null;
  ai_reasoning: string | null;
  suggested_kb_article_id: string | null;
  classification_source: "gemini" | "mock" | null;
  breached: boolean;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export interface KbArticle {
  id: string;
  title: string;
  body: string;
  category: string;
}

export interface AnalyticsSummary {
  avgResolutionMinutes: number;
  slaBreachPct: number;
  slaBreachedCount: number;
  slaTotalWithDeadline: number;
  ticketsByCategory: { category: string; count: number }[];
  ticketsByDay: { day: string; count: number }[];
  perAgentLoad: {
    id: string;
    name: string;
    current_workload: number;
    resolved_count: number;
    total_assigned: number;
  }[];
  totals: {
    total_tickets: number;
    open_count: number;
    in_progress_count: number;
    resolved_count: number;
  };
}
