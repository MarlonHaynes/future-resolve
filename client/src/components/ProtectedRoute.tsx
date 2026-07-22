import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ requireRole }: { requireRole?: "admin" }) {
  const { agent, loading } = useAuth();

  if (loading) return <div className="login-screen">Loading...</div>;
  if (!agent) return <Navigate to="/login" replace />;
  if (requireRole && agent.role !== requireRole) return <Navigate to="/" replace />;

  return <Outlet />;
}
