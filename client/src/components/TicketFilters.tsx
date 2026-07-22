export interface TicketFiltersState {
  status: string;
  category: string;
  priority: string;
}

export function TicketFilters({
  value,
  onChange,
  categories,
}: {
  value: TicketFiltersState;
  onChange: (next: TicketFiltersState) => void;
  categories: string[];
}) {
  return (
    <div className="filters-bar">
      <select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
      </select>

      <select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })}>
        <option value="">All priorities</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="med">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
  );
}
