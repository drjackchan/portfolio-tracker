import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  Sun,
  Moon,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import PerplexityAttribution from "./PerplexityAttribution";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/holdings", label: "Holdings", icon: Briefcase },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useHashLocation();
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <svg
            aria-label="PortfolioTrack"
            viewBox="0 0 32 32"
            fill="none"
            className="w-8 h-8 flex-shrink-0"
          >
            <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
            <polyline
              points="4,22 10,14 16,18 22,10 28,10"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="28" cy="10" r="2.5" fill="white" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">PortfolioTrack</div>
            <div className="text-xs text-muted-foreground leading-tight">Personal Wealth</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <ul className="space-y-0.5">
            {navItems.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href}>
                  <a
                    data-testid={`nav-${label.toLowerCase()}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      isActive(href)
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {label}
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom: theme toggle + attribution */}
        <div className="px-3 py-4 border-t border-sidebar-border space-y-2">
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <PerplexityAttribution />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
    </div>
  );
}
