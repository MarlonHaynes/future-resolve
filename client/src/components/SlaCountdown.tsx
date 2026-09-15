import { useEffect, useRef, useState } from "react";
import { SlaOutcome } from "../types";

function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(minutes).padStart(2, "0")}m`);
  if (days === 0) parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}

/**
 * Live-updating countdown to (or overdue timer past) an SLA deadline.
 * `outcome` is what the SLA engine did at the last breach: escalated and
 * restarted tickets get a tag next to their fresh countdown, auto-resolved
 * tickets say so instead of plain "Resolved". `onExpire` fires once when the
 * countdown crosses 0 while on screen, so the page can apply the outcome.
 */
export function SlaCountdown({
  deadline,
  resolved,
  outcome = null,
  onExpire,
}: {
  deadline: string | null;
  resolved: boolean;
  outcome?: SlaOutcome | null;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  // null until the first check for this deadline, so an already-overdue
  // ticket doesn't fire onExpire just by being rendered
  const wasBreachedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (resolved || !deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resolved, deadline]);

  useEffect(() => {
    wasBreachedRef.current = null;
  }, [deadline]);

  useEffect(() => {
    if (resolved || !deadline) return;
    const isBreached = new Date(deadline).getTime() - now < 0;
    if (wasBreachedRef.current === false && isBreached) onExpireRef.current?.();
    wasBreachedRef.current = isBreached;
  }, [now, deadline, resolved]);

  if (resolved) {
    return <span className="muted">{outcome === "auto_resolved" ? "Auto-resolved (stale)" : "Resolved"}</span>;
  }
  if (!deadline) return <span className="muted">No SLA policy matched</span>;

  const diff = new Date(deadline).getTime() - now;
  const breached = diff < 0;
  const warn = !breached && diff < 30 * 60 * 1000; // under 30 min left
  const tag = !breached && (outcome === "escalated" || outcome === "restarted") ? outcome : null;

  return (
    <span className="sla-cell">
      <span className={`countdown ${breached ? "breached" : warn ? "warn" : "ok"}`}>
        {breached ? `Breached — ${formatRemaining(diff)} overdue` : `${formatRemaining(diff)} remaining`}
      </span>
      {tag && <span className={`sla-tag sla-tag-${tag}`}>{tag === "escalated" ? "Escalated" : "Restarted"}</span>}
    </span>
  );
}
