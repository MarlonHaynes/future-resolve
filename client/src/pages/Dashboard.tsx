import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { TicketPage } from "../types";
import { TicketFilters, TicketFiltersState } from "../components/TicketFilters";
import { TicketList } from "../components/TicketList";
import { Pagination } from "../components/Pagination";
import { useSlaExpiry } from "../hooks/useSlaExpiry";

const PAGE_SIZE = 60;

export function Dashboard() {
  // Filters and page live in the URL, so going back from a ticket returns to
  // the same filtered page. Filtering happens server-side over the full set;
  // the server then returns just the requested page plus full-set counts.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters: TicketFiltersState = {
    status: searchParams.get("status") ?? "",
    category: searchParams.get("category") ?? "",
    priority: searchParams.get("priority") ?? "",
  };
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<TicketPage | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const silentReload = useRef(false);

  useEffect(() => {
    api.get<{ categories: string[] }>("/meta").then((r) => setCategories(r.categories));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // SLA-triggered refreshes update in place; filter/page changes show the loading state
    if (!silentReload.current) setLoading(true);
    silentReload.current = false;

    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.priority) params.set("priority", filters.priority);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    api
      .get<TicketPage>(`/tickets?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
        // the server clamps out-of-range pages (e.g. a stale ?page=9); keep the URL honest
        if (r.page !== page) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (r.page > 1) next.set("page", String(r.page));
              else next.delete("page");
              return next;
            },
            { replace: true }
          );
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.category, filters.priority, page, reloadKey]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  // several countdowns can hit 0 in the same second — coalesce into one refetch
  const refreshSilently = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      silentReload.current = true;
      setReloadKey((k) => k + 1);
    }, 300);
  }, []);
  const handleSlaExpire = useSlaExpiry(refreshSilently);

  function changeFilters(next: TicketFiltersState) {
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.category) params.set("category", next.category);
    if (next.priority) params.set("priority", next.priority);
    setSearchParams(params); // new filter set -> back to page 1
  }

  function changePage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage > 1) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
    window.scrollTo({ top: 0 });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ticket Dashboard</h1>
          <div className="page-subtitle">
            {data
              ? `${data.total} tickets shown · ${data.openCount} open · ${data.breachedCount} breached`
              : "Loading..."}
          </div>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New Ticket
        </Link>
      </div>

      <TicketFilters value={filters} onChange={changeFilters} categories={categories} />

      {error && <div className="form-error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading || !data ? (
          <div className="empty-state">Loading tickets...</div>
        ) : (
          <TicketList tickets={data.tickets} onSlaExpire={handleSlaExpire} />
        )}
      </div>

      {data && !loading && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          onChange={changePage}
        />
      )}
    </div>
  );
}
