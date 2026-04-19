import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useState, useEffect, useCallback, createContext, useContext } from "react";
import Dashboard from "@/pages/Dashboard";
import Holdings from "@/pages/Holdings";
import AddEditAsset from "@/pages/AddEditAsset";
import Liabilities from "@/pages/Liabilities";
import AddEditLiability from "@/pages/AddEditLiability";
import Transactions from "@/pages/Transactions";
import AdSense from "@/pages/AdSense";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";

// ── Auth context ──────────────────────────────────────────────────────────────
interface AuthCtx { logout: () => void; }
const AuthContext = createContext<AuthCtx>({ logout: () => {} });
export const useAuth = () => useContext(AuthContext);

type AuthState = "loading" | "authenticated" | "unauthenticated";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/holdings" component={Holdings} />
        <Route path="/holdings/new" component={AddEditAsset} />
        <Route path="/holdings/:id/edit" component={AddEditAsset} />
        <Route path="/liabilities" component={Liabilities} />
        <Route path="/liabilities/new" component={AddEditLiability} />
        <Route path="/liabilities/:id/edit" component={AddEditLiability} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/adsense" component={AdSense} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Check existing session on mount
  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => setAuthState(d.authenticated ? "authenticated" : "unauthenticated"))
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  const handleUnauth = useCallback(() => {
    queryClient.clear();
    setAuthState("unauthenticated");
  }, []);

  const handleLogin = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    handleUnauth();
  }, [handleUnauth]);

  // Global 401 handler
  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        const err = event.query.state.error;
        if (err instanceof Error && err.message.startsWith("401:")) {
          handleUnauth();
        }
      }
    });
    return unsub;
  }, [handleUnauth]);

  // Loading spinner
  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Login page (no QueryClientProvider needed — uses raw fetch)
  if (authState === "unauthenticated") {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
