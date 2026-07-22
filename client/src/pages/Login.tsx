import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { agent, login } = useAuth();
  const [email, setEmail] = useState("admin@futureresolve.demo");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (agent) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-title">
          Future<span style={{ color: "var(--series-1)" }}>Resolve</span>
        </div>
        <p className="login-subtitle">Support ticket triage, sign in to continue.</p>

        {error && <div className="form-error">{error}</div>}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <div className="demo-creds">
          Demo accounts (password <code>password123</code>):
          <br />
          Admin: <code>admin@futureresolve.demo</code>
          <br />
          Agent: <code>priya@futureresolve.demo</code>
        </div>
      </form>
    </div>
  );
}
