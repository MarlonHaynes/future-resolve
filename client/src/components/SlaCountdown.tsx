import { useEffect, useState } from "react";

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

/** Live-updating countdown to (or overdue timer past) an SLA deadline. */
export function SlaCountdown({ deadline, resolved }: { deadline: string | null; resolved: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (resolved || !deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resolved, deadline]);

  if (!deadline) return <span className="muted">No SLA policy matched</span>;
  if (resolved) return <span className="muted">Resolved</span>;

  const diff = new Date(deadline).getTime() - now;
  const breached = diff < 0;
  const warn = !breached && diff < 30 * 60 * 1000; // under 30 min left

  return (
    <span className={`countdown ${breached ? "breached" : warn ? "warn" : "ok"}`}>
      {breached ? `Breached — ${formatRemaining(diff)} overdue` : `${formatRemaining(diff)} remaining`}
    </span>
  );
}
