import { TicketEvent } from "../types";

const TYPE_LABELS: Record<string, string> = {
  created: "Ticket Created",
  classified: "AI Classified",
  assigned: "Assigned",
  reassigned: "Reassigned",
  status_changed: "Status Changed",
  priority_changed: "Priority Changed",
  sla_breach: "SLA Breached",
};

export function EventTimeline({ events }: { events: TicketEvent[] }) {
  if (events.length === 0) return <p className="muted">No events yet.</p>;

  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`event-${e.event_type}`}>
          <div className="timeline-type">{TYPE_LABELS[e.event_type] ?? e.event_type}</div>
          {e.detail && <div className="timeline-detail">{e.detail}</div>}
          <div className="timeline-time">{new Date(e.created_at).toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
}
