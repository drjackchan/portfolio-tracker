import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  CreditCard,
  Sun,
  Moon,
  Menu,
  X,
  LogOut,
  DollarSign,
  RefreshCw,
  Eye,
  Plus
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toHkd } from "@/lib/utils";
import { Sparkline } from "@/components/Sparkline";
import { useAuth } from "../App";
import type { Asset, Liability, WatchlistItem, PortfolioSnapshot as Snapshot } from "@shared/schema";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/holdings", label: "Assets", icon: Briefcase },
  { href: "/liabilities", label: "Liabilities", icon: CreditCard },
  { href: "/subscriptions", label: "Subscriptions", icon: RefreshCw },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/adsense", label: "Google Revenue", icon: DollarSign },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout } = useAuth();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location.startsWith(href);
  };

  // Compact formatter for sidebar watchlist preview.
  // Regular items use HK$ (to match overall app HKD bias). Indexes use plain numbers (no currency unit).
  const formatCompact = (val: number, symbol?: string, name?: string | null) => {
    const s = (symbol || '').toUpperCase().trim();
    const n = (name || '').toLowerCase();
    const isIndex = s.startsWith('^') ||
                    n.includes('index') ||
                    n.includes('composite') ||
                    n.includes('average') ||
                    s === '000001.SS';

    if (isIndex) {
      if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
      if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
      return new Intl.NumberFormat("en-HK", { minimumFractionDigits: 0 }).format(val);
    }

    // Regular prices (stocks etc.)
    if (Math.abs(val) >= 1_000_000) return `HK$${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `HK$${(val / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 0 }).format(val);
  };

  // Data for sidebar "Lists" (Portfolios + Watchlist preview)
  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"], staleTime: 30_000 });
  const { data: liabilities = [] } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"], staleTime: 30_000 });
  const { data: snapshots = [] } = useQuery<Snapshot[]>({ queryKey: ["/api/snapshots"], staleTime: 60_000 });
  const { data: watchlistItems = [] } = useQuery<WatchlistItem[]>({ queryKey: ["/api/watchlist"], staleTime: 15_000 });

  const totalAssetsValue = assets.reduce((s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + toHkd(l.balance, l.currency), 0);
  const totalNetWorth = totalAssetsValue - totalLiabilities;

  // Simple daily change using latest snapshot
  const sortedSnaps = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  const latestSnap = sortedSnaps[0];
  const dailyChange = latestSnap ? totalNetWorth - (latestSnap.totalValue - (latestSnap.totalLiability || 0)) : null;
  const dailyPct = latestSnap && latestSnap.totalValue > 0 
    ? (dailyChange! / Math.abs(latestSnap.totalValue - (latestSnap.totalLiability || 0))) * 100 
    : null;

  // Watchlist prices for sidebar mini sparklines
  const watchlistSymbols = watchlistItems.map(item => ({
    symbol: item.symbol,
    assetType: item.assetType,
    currency: "HKD" as const,
  }));
  const { data: watchlistPrices = {} as Record<string, any> } = useQuery({
    queryKey: ["/api/prices/market-data/symbols", watchlistItems.map(i => i.id)],
    enabled: watchlistItems.length > 0,
    queryFn: async () => {
      if (watchlistSymbols.length === 0) return {};
      const res = await apiRequest("POST", "/api/prices/market-data/symbols", { symbols: watchlistSymbols });
      return res.json();
    },
    staleTime: 60_000,
  });

  const SidebarContent = () => (
    <>
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

      {/* Nav (menu only) */}
      <nav className="py-3 px-2">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href}>
                <a
                  data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
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

      {/* Watchlist preview placed right below the menu items.
          This section now grows to fill all available height in the sidebar
          (between the main nav and the bottom actions). */}
      <div className="border-t border-sidebar-border py-2 text-sm flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-3 mb-1 flex-shrink-0">
          <span className="font-semibold text-muted-foreground">Watchlist</span>
          <Link href="/watchlist">
            <button className="p-0.5 text-muted-foreground hover:text-foreground" title="Manage Watchlist">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {watchlistItems.length === 0 ? (
          <div className="px-3 py-1 text-xs text-muted-foreground">
            No items. <Link href="/watchlist" className="underline">Add</Link>
          </div>
        ) : (
          <div 
            className="flex-1 min-h-0 overflow-y-auto space-y-0.5 text-xs pl-3 pr-2 bg-sidebar
                       [scrollbar-width:thin] 
                       [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full 
                       [&::-webkit-scrollbar-thumb]:bg-sidebar-border/40 
                       hover:[&::-webkit-scrollbar-thumb]:bg-sidebar-border/70
                       [&::-webkit-scrollbar-track]:bg-sidebar [&::-webkit-scrollbar-corner]:bg-sidebar"
          >
            {watchlistItems.map((item) => {
              const key = item.symbol.toUpperCase();
              const md = watchlistPrices[key] || {};
              const price = md.price;
              const ch = md.change24h ?? md.change7d;
              const isPos = ch != null && ch >= 0;
              const spark = md.sparkline || [];
              const displayName = item.name || item.symbol.replace(/^\^/, '');
              const ticker = item.symbol.replace(/^\^/, '');
              return (
                <div key={item.id} className="flex items-center gap-2 -ml-3 pl-3 pr-3 py-1 rounded hover:bg-sidebar-accent">
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="font-semibold text-sm truncate">{displayName}</div>
                    {item.name && (
                      <div className="font-mono text-muted-foreground truncate text-[10px] leading-none -mt-0.5">
                        {ticker}
                      </div>
                    )}
                  </div>
                  <div className="w-11 h-4 flex-shrink-0">
                    {spark.length >= 2 ? (
                      <Sparkline data={spark} positive={isPos} width={44} height={16} />
                    ) : null}
                  </div>
                  <div className="font-mono tabular-nums text-right min-w-[52px] leading-tight">
                    <div className="text-xs font-semibold">{price != null ? formatCompact(price, item.symbol, item.name) : "—"}</div>
                    {ch != null && (
                      <div className={`text-[10px] ${isPos ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                        {isPos ? "▲" : "▼"}{ch.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-2">
        <button
          data-testid="theme-toggle"
          onClick={toggleTheme}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
        <button
          data-testid="logout-btn"
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay drawer ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background flex-shrink-0">
          <button
            data-testid="mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6 flex-shrink-0">
              <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
              <polyline points="4,22 10,14 16,18 22,10 28,10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="28" cy="10" r="2.5" fill="white" />
            </svg>
            <span className="text-sm font-semibold text-foreground">PortfolioTrack</span>
          </div>
          <button
            onClick={toggleTheme}
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
