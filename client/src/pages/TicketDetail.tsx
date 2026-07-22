import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Agent, KbArticle, Ticket, TicketEvent, TicketStatus } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { PriorityBadge } from "../components/PriorityBadge";
import { SlaCountdown } from "../components/SlaCountdown";
import { ClassificationPanel } from "../components/ClassificationPanel";
import { EventTimeline } from "../components/EventTimeline";
import { useAuth } from "../context/AuthContext";

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { agent: currentAgent } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [kbArticle, setKbArticle] = useState<KbArticle | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    api
      .get<{ ticket: Ticket; events: TicketEvent[]; kbArticle: KbArticle | null }>(`/tickets/${id}`)
      .then((r) => {
        setTicket(r.ticket);
        setEvents(r.events);
        setKbArticle(r.kbArticle);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.get<{ agents: Agent[] }>("/agents").then((r) => setAgents(r.agents));
  }, []);

  async function updateStatus(status: TicketStatus) {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/tickets/${id}`, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function reassign(agentId: string) {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/tickets/${id}`, { assigned_agent_id: agentId || null });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket() {
    if (!id || !confirm("Delete this ticket permanently?")) return;
    setBusy(true);
    try {
      await api.delete(`/tickets/${id}`);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  if (error && !ticket) return <div className="form-error">{error}</div>;
  if (!ticket) return <div className="empty-state">Loading ticket...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{ticket.subject}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
              {ticket.category}
            </span>
            {ticket.breached && <span className="badge breach-badge">SLA Breached</span>}
          </div>
        </div>
        {currentAgent?.role === "admin" && (
          <button className="btn btn-danger" onClick={deleteTicket} disabled={busy}>
            Delete
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h3 className="section-title">Description</h3>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{ticket.body}</p>
          </div>

          <div className="card">
            <h3 className="section-title">Manage</h3>
            <div className="field">
              <label>Status</label>
              <select
                value={ticket.status}
                disabled={busy}
                onChange={(e) => updateStatus(e.target.value as TicketStatus)}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="field">
              <label>Assigned agent</label>
              <select
                value={ticket.assigned_agent_id ?? ""}
                disabled={busy}
                onChange={(e) => reassign(e.target.value)}
              >
                <option value="">Unassigned</option>
                {agents
                  .filter((a) => a.role === "agent")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (load: {a.current_workload})
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>SLA</label>
              <SlaCountdown deadline={ticket.sla_deadline} resolved={ticket.status === "resolved"} />
              {ticket.sla_deadline && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Deadline: {new Date(ticket.sla_deadline).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Event Timeline</h3>
            <EventTimeline events={events} />
          </div>
        </div>

        <div className="card">
          <ClassificationPanel ticket={ticket} kbArticle={kbArticle} />
        </div>
      </div>
    </div>
  );
}
