import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error === "Incorrect password" ? "Incorrect password. Please try again." : "Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
              <polyline
                points="4,22 10,14 16,18 22,10 28,10"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="28" cy="10" r="2.5" fill="white" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">PortfolioTrack</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Personal Wealth</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Sign in to your portfolio
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    placeholder="Enter your password"
                    autoFocus
                    className={`pr-10 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    data-testid="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-destructive mt-1">{error}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !password}
                data-testid="login-btn"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
