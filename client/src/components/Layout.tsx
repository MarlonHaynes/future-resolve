import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { agent, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          Future<span>Resolve</span>
        </div>
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Dashboard
        </NavLink>
        <NavLink to="/new" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          New Ticket
        </NavLink>
        {agent?.role === "admin" && (
          <NavLink to="/analytics" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            Analytics
          </NavLink>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">{agent?.name}</div>
          <div className="sidebar-role">{agent?.role}</div>
          <button className="logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
