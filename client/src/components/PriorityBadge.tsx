import { Priority } from "../types";

const LABELS: Record<Priority, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge priority-${priority}`}>{LABELS[priority]}</span>;
}
