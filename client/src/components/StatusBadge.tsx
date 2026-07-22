import { TicketStatus } from "../types";

const LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="badge-dot" />
      {LABELS[status]}
    </span>
  );
}
