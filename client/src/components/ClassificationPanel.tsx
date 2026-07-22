import { KbArticle, Ticket } from "../types";

/** Displays the AI classification reasoning transparently — never a black box. */
export function ClassificationPanel({ ticket, kbArticle }: { ticket: Ticket; kbArticle: KbArticle | null }) {
  return (
    <div className="stack">
      <div className="spread">
        <h3 className="section-title" style={{ margin: 0 }}>
          AI Classification
        </h3>
        {ticket.classification_source && (
          <span className={`source-tag ${ticket.classification_source}`}>
            {ticket.classification_source === "gemini" ? "Live Gemini" : "Mock classifier"}
          </span>
        )}
      </div>

      {ticket.ai_reasoning ? (
        <div className="reasoning-box">{ticket.ai_reasoning}</div>
      ) : (
        <p className="muted">No classification recorded.</p>
      )}

      {kbArticle && (
        <div>
          <div className="section-title" style={{ marginBottom: 6 }}>
            Suggested KB Article
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{kbArticle.title}</div>
            <div className="secondary-text" style={{ fontSize: 13, marginTop: 4 }}>
              {kbArticle.body}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
