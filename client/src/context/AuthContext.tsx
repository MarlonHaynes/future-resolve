import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { AuthedAgent } from "../types";

interface AuthContextValue {
  agent: AuthedAgent | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<AuthedAgent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("fr_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ agent: AuthedAgent }>("/auth/me")
      .then((res) => setAgent(res.agent))
      .catch(() => localStorage.removeItem("fr_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; agent: AuthedAgent }>("/auth/login", { email, password });
    localStorage.setItem("fr_token", res.token);
    setAgent(res.agent);
  }

  function logout() {
    localStorage.removeItem("fr_token");
    setAgent(null);
  }

  return <AuthContext.Provider value={{ agent, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
