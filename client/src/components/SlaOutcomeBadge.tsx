import { SlaOutcome } from "../types";

export const SLA_OUTCOME_LABELS: Record<SlaOutcome, string> = {
  escalated: "Escalated",
  auto_resolved: "Auto-resolved",
  restarted: "Restarted",
  breached_final: "Breached — final",
};

export function SlaOutcomeBadge({ outcome }: { outcome: SlaOutcome }) {
  return <span className={`badge sla-outcome-${outcome}`}>SLA {SLA_OUTCOME_LABELS[outcome]}</span>;
}
