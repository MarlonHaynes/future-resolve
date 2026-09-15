import { useNavigate } from "react-router-dom";
import { Ticket } from "../types";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { SlaCountdown } from "./SlaCountdown";

export function TicketList({
  tickets,
  onSlaExpire,
}: {
  tickets: Ticket[];
  onSlaExpire?: (ticketId: string) => void;
}) {
  const navigate = useNavigate();

  if (tickets.length === 0) {
    return <div className="empty-state">No tickets match these filters.</div>;
  }

  return (
    <table className="ticket-table">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Category</th>
          <th>Agent</th>
          <th>SLA</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id} className="ticket-row" onClick={() => navigate(`/tickets/${t.id}`)}>
            <td className="ticket-subject">{t.subject}</td>
            <td>
              <StatusBadge status={t.status} />
            </td>
            <td>
              <PriorityBadge priority={t.priority} />
            </td>
            <td className="secondary-text">{t.category}</td>
            <td className="secondary-text">{t.assigned_agent_name ?? "Unassigned"}</td>
            <td>
              <SlaCountdown
                deadline={t.sla_deadline}
                resolved={t.status === "resolved"}
                outcome={t.sla_outcome}
                onExpire={onSlaExpire && (() => onSlaExpire(t.id))}
              />
            </td>
            <td className="muted">{new Date(t.created_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
