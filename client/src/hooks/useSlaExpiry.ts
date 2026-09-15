import { useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import { SlaOutcome } from "../types";

const SERVER_CLOCK_GRACE_MS = 1500;
const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 3;

/**
 * Returns a handler for SlaCountdown's onExpire. When a live countdown hits 0
 * it asks the server to apply the SLA breach outcome right away (escalate,
 * restart, auto-resolve, or leave breached), then calls onChanged so the page
 * can refetch. If the server doesn't consider the ticket due yet (small clock
 * skew) it retries a couple of times; the background sweep is the backstop.
 */
export function useSlaExpiry(onChanged: () => void) {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  return useCallback(
    (ticketId: string) => {
      const attempt = (n: number) => {
        api
          .post<{ outcome: SlaOutcome | null }>(`/tickets/${ticketId}/sla-check`)
          .then((r) => {
            if (r.outcome || n >= MAX_ATTEMPTS) onChangedRef.current();
            else later(() => attempt(n + 1), RETRY_DELAY_MS);
          })
          .catch(() => onChangedRef.current());
      };
      later(() => attempt(1), SERVER_CLOCK_GRACE_MS);
    },
    [later]
  );
}
