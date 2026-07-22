import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Ticket } from "../types";

export function NewTicket() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"mock" | "live" | null>(null);

  async function submit(useLiveAI: boolean) {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and description are both required.");
      return;
    }
    setError(null);
    setSubmitting(useLiveAI ? "live" : "mock");
    try {
      const res = await api.post<{ ticket: Ticket }>("/tickets", { subject, body, useLiveAI });
      navigate(`/tickets/${res.ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New Ticket</h1>
          <div className="page-subtitle">
            Submitted tickets are classified automatically, SLA'd, and auto-routed to the least-loaded agent.
          </div>
        </div>
      </div>

      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue" />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Full details of the issue..."
          />
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={submitting !== null}>
            {submitting === "mock" ? "Creating..." : "Create Ticket"}
          </button>

          <button
            className="btn btn-ai"
            type="button"
            disabled={submitting !== null}
            onClick={() => submit(true)}
            title="Makes one real call to the Gemini API for this ticket only"
          >
            {submitting === "live" ? "Calling Gemini..." : "✦ Try live classification"}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          "Create Ticket" uses the instant offline mock classifier. "Try live classification" makes a single real
          Gemini 2.5 Flash API call for this ticket — use it on demand, not automatically, to protect the API rate
          limit. Requires <code>GEMINI_API_KEY</code> to be configured on the server; otherwise it transparently
          falls back to the mock classifier.
        </p>
      </form>
    </div>
  );
}
