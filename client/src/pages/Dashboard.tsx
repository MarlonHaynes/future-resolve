import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Ticket } from "../types";
import { TicketFilters, TicketFiltersState } from "../components/TicketFilters";
import { TicketList } from "../components/TicketList";

export function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState<TicketFiltersState>({ status: "", category: "", priority: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ categories: string[] }>("/meta").then((r) => setCategories(r.categories));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.priority) params.set("priority", filters.priority);

    api
      .get<{ tickets: Ticket[] }>(`/tickets?${params.toString()}`)
      .then((r) => setTickets(r.tickets))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const counts = useMemo(() => {
    return {
      open: tickets.filter((t) => t.status === "open").length,
      breached: tickets.filter((t) => t.breached).length,
    };
  }, [tickets]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ticket Dashboard</h1>
          <div className="page-subtitle">
            {tickets.length} tickets shown · {counts.open} open · {counts.breached} breached
          </div>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New Ticket
        </Link>
      </div>

      <TicketFilters value={filters} onChange={setFilters} categories={categories} />

      {error && <div className="form-error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? <div className="empty-state">Loading tickets...</div> : <TicketList tickets={tickets} />}
      </div>
    </div>
  );
}
