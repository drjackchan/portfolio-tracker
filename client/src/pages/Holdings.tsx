import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import type { Asset } from "@shared/schema";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks", crypto: "Crypto", property: "Property", other: "Other", commodity: "Commodities",
};
const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))", crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))", other: "hsl(var(--chart-5))",
  commodity: "hsl(var(--chart-6))",
};

// HKD conversion (approx)
const USD_RATE = 7.8;
const toHkd = (v: number, ccy: string) => ccy === "USD" ? v * USD_RATE : v;

function formatCurrency(val: number, compact = false) {
  if (compact && Math.abs(val) >= 1_000_000) return `HK$${(val / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(val) >= 1_000) return `HK$${(val / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(val);
}

function formatNativeCurrency(val: number, currency: string) {
  return new Intl.NumberFormat("en-HK", { style: "currency", currency: currency || "HKD", minimumFractionDigits: 2 }).format(val);
}

function formatPct(val: number) {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

const FILTER_TYPES = ["All", "stock", "crypto", "property", "commodity", "other"] as const;

export default function Holdings() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // Sorting state (similar to Dashboard)
  const [sortKey, setSortKey] = useState<string>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Grouping by ticker (for assets with same symbol/ticker but different account names)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: assets = [], isLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  type MarketData = {
    price: number | null;
    change1h: number | null;
    change24h: number | null;
    change7d: number | null;
    sparkline: number[];
  };

  // Live market stats (1h/24h/7d % + sparkline) for assets that support auto price (stock/crypto/commodity with ticker)
  const { data: marketData = {} as Record<number, MarketData> } = useQuery<Record<number, MarketData>>({
    queryKey: ["/api/prices/market-data"],
    enabled: assets.some((a) => (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && !!a.ticker),
    staleTime: 1000 * 60 * 3, // 3 minutes – crypto providers (especially CG) are rate-limited
    refetchOnWindowFocus: false,
  });

  // Refresh ALL prices
  const refreshAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/prices/refresh"),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      // Do NOT aggressively invalidate market-data here — server has caching and the provider
      // (CoinGecko especially) is rate-limited. The query has its own staleTime.
      // A page reload or waiting a couple minutes will bring fresh 1h/24h/7d + sparklines.
      toast({
        title: "Prices updated",
        description: data?.message ?? "All prices refreshed",
      });
    },
    onError: () => {
      toast({ title: "Failed to refresh prices", variant: "destructive" });
    },
  });

  // Refresh single asset price
  const refreshOneMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prices/refresh/${id}`),
    onSuccess: async (res: any, id: number) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      // Market % / sparklines are intentionally not force-refetched on every single price update
      // to avoid hammering rate-limited providers (CoinGecko). They refresh on their own schedule.
      toast({
        title: "Price updated",
        description: data?.ticker ? `${data.ticker}: ${formatNativeCurrency(data.price, data.asset?.currency ?? "HKD")}` : "Price updated",
      });
      setRefreshingId(null);
    },
    onError: async (err: any, id: number) => {
      setRefreshingId(null);
      toast({ title: "Could not fetch price", description: "Check the ticker symbol", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); toast({ title: "Asset deleted" }); },
    onError: () => { toast({ title: "Failed to delete", variant: "destructive" }); },
  });

  const refreshableCount = assets.filter(
    (a) => (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && a.ticker
  ).length;

  const canAutoRefresh = (a: Asset) =>
    (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && !!a.ticker;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Default direction: asc for text, desc for numeric values
      setSortDir(key === "name" || key === "type" || key === "category" ? "asc" : "desc");
    }
  };

  const toggleGroup = (ticker: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  // Apply search + type filter
  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      (a.name.toLowerCase().includes(q) || (a.ticker ?? "").toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q)) &&
      (filterType === "All" || a.assetType === filterType)
    );
  });

  // Group by ticker (only assets with the same non-empty ticker are grouped)
  // We build groups, compute aggregates, sort the groups (respecting current sort), then decide display rows
  type AssetGroup = {
    ticker: string; // the group key (or `single-${id}` for ungrouped)
    assets: Asset[];
    totalQty: number;
    totalValue: number; // in HKD
    totalCost: number; // in HKD
    totalGain: number; // in HKD
    gainPct: number;
    md?: MarketData;
    representative: Asset;
  };

  const groupMap = new Map<string, Asset[]>();
  const singleAssets: Asset[] = [];

  for (const a of filtered) {
    const t = a.ticker?.trim();
    if (t) {
      if (!groupMap.has(t)) groupMap.set(t, []);
      groupMap.get(t)!.push(a);
    } else {
      singleAssets.push(a);
    }
  }

  const groups: AssetGroup[] = [];

  // Multi-asset groups
  for (const [ticker, assetsInGroup] of groupMap.entries()) {
    const totalQty = assetsInGroup.reduce((s, a) => s + a.quantity, 0);
    const totalValue = assetsInGroup.reduce((s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0);
    const totalCost = assetsInGroup.reduce((s, a) => s + toHkd(a.quantity * a.purchasePrice, a.currency), 0);
    const totalGain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const md = marketData[assetsInGroup[0].id];
    const representative = assetsInGroup[0];

    groups.push({
      ticker,
      assets: assetsInGroup,
      totalQty,
      totalValue,
      totalCost,
      totalGain,
      gainPct,
      md,
      representative,
    });
  }

  // Single (no ticker or unique)
  for (const a of singleAssets) {
    const value = toHkd(a.quantity * a.currentPrice, a.currency);
    const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    const md = marketData[a.id];
    groups.push({
      ticker: `single-${a.id}`,
      assets: [a],
      totalQty: a.quantity,
      totalValue: value,
      totalCost: cost,
      totalGain: gain,
      gainPct,
      md,
      representative: a,
    });
  }

  // Sort groups according to current sortKey / sortDir (group-level aggregates for numeric fields)
  groups.sort((ga, gb) => {
    let va: number | string;
    let vb: number | string;

    const mda = ga.md;
    const mdb = gb.md;

    switch (sortKey) {
      case "name":
        va = ga.representative.name.toLowerCase();
        vb = gb.representative.name.toLowerCase();
        break;
      case "type":
        va = ga.representative.assetType;
        vb = gb.representative.assetType;
        break;
      case "category":
        va = (ga.representative.category || "").toLowerCase();
        vb = (gb.representative.category || "").toLowerCase();
        break;
      case "qty":
        va = ga.totalQty;
        vb = gb.totalQty;
        break;
      case "buy":
        va = ga.representative.purchasePrice;
        vb = gb.representative.purchasePrice;
        break;
      case "current":
        va = mda?.price ?? ga.representative.currentPrice;
        vb = mdb?.price ?? gb.representative.currentPrice;
        break;
      case "1h":
        va = mda?.change1h ?? -Infinity;
        vb = mdb?.change1h ?? -Infinity;
        break;
      case "24h":
        va = mda?.change24h ?? -Infinity;
        vb = mdb?.change24h ?? -Infinity;
        break;
      case "7d":
        va = mda?.change7d ?? -Infinity;
        vb = mdb?.change7d ?? -Infinity;
        break;
      case "value":
        va = ga.totalValue;
        vb = gb.totalValue;
        break;
      case "return":
        va = ga.gainPct;
        vb = gb.gainPct;
        break;
      default:
        va = 0;
        vb = 0;
    }

    if (typeof va === "string" && typeof vb === "string") {
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    }

    const na = va as number;
    const nb = vb as number;
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    if (na < nb) return sortDir === "asc" ? -1 : 1;
    if (na > nb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Build display rows: for multi-ticker groups we can collapse
  type DisplayItem =
    | { kind: "summary"; group: AssetGroup }
    | { kind: "detail"; asset: Asset; groupTicker: string };

  const displayItems: DisplayItem[] = [];

  for (const group of groups) {
    const isMulti = group.assets.length > 1;
    const isExpanded = isMulti && expandedGroups.has(group.ticker);

    if (isMulti && !isExpanded) {
      // collapsed summary row for the group
      displayItems.push({ kind: "summary", group });
    } else {
      // show all members (for singles, or expanded groups)
      for (const asset of group.assets) {
        displayItems.push({ kind: "detail", asset, groupTicker: group.ticker });
      }
    }
  }

  // Calculate totals for each category
  const totalsByCategory = assets.reduce((acc, a) => {
    const val = toHkd(a.quantity * a.currentPrice, a.currency);
    acc[a.assetType] = (acc[a.assetType] || 0) + val;
    acc["total"] = (acc["total"] || 0) + val;
    return acc;
  }, {} as Record<string, number>);

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6 space-y-5 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Holdings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your assets</p>
          </div>
          <div className="flex items-center gap-2">
            {refreshableCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshAllMutation.mutate()}
                    disabled={refreshAllMutation.isPending}
                    data-testid="refresh-all-btn"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshAllMutation.isPending ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">
                      {refreshAllMutation.isPending ? "Refreshing…" : "Refresh Prices"}
                    </span>
                    <span className="sm:hidden">
                      {refreshAllMutation.isPending ? "…" : "Refresh"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auto-fetch latest prices for {refreshableCount} stock{refreshableCount !== 1 ? "s" : ""}/crypto/commodity</p>
                  <p className="text-xs text-muted-foreground">1h/24h/7d % + 7d trend update on their own schedule (cached)</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Link href="/holdings/new">
              <Button data-testid="add-asset-holdings-btn" size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">Add Asset</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Totals Section */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="bg-sidebar-accent/50 border-sidebar-border" data-testid="total-assets-card">
            <CardContent className="p-4">
              <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 truncate">Total Assets</div>
              {isLoading ? <Skeleton className="h-6 w-20" /> : (
                <div className="text-lg sm:text-xl font-semibold font-mono truncate">{formatCurrency(totalsByCategory["total"] || 0, true)}</div>
              )}
            </CardContent>
          </Card>
          {FILTER_TYPES.filter(t => t !== "All").map(type => {
            const val = totalsByCategory[type] || 0;
            if (!isLoading && val === 0) return null; // Hide empty categories to save space
            
            return (
              <Card key={type} data-testid={`total-${type}-card`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: ASSET_TYPE_COLORS[type] }} />
                    <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{ASSET_TYPE_LABELS[type]}</div>
                  </div>
                  {isLoading ? <Skeleton className="h-6 w-20" /> : (
                    <div className="text-lg sm:text-xl font-semibold font-mono truncate">{formatCurrency(val, true)}</div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="search-input"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TYPES.map((t) => (
              <button
                key={t}
                data-testid={`filter-${t}`}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filterType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {t === "All" ? "All" : ASSET_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-muted-foreground text-sm">{assets.length === 0 ? "No assets yet." : "No matching assets."}</p>
                {assets.length === 0 && <Link href="/holdings/new"><Button size="sm" variant="outline">Add your first asset</Button></Link>}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th
                          className={`text-left text-xs text-muted-foreground font-medium px-5 py-3 cursor-pointer hover:text-foreground ${sortKey === "name" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("name")}
                        >
                          Asset {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-left text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "type" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("type")}
                        >
                          Type {sortKey === "type" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-left text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "category" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("category")}
                        >
                          Category {sortKey === "category" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "qty" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("qty")}
                        >
                          Qty {sortKey === "qty" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "buy" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("buy")}
                        >
                          Buy Price {sortKey === "buy" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "current" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("current")}
                        >
                          Current {sortKey === "current" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 cursor-pointer hover:text-foreground ${sortKey === "1h" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("1h")}
                        >
                          1h % {sortKey === "1h" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 cursor-pointer hover:text-foreground ${sortKey === "24h" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("24h")}
                        >
                          24h % {sortKey === "24h" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 cursor-pointer hover:text-foreground ${sortKey === "7d" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("7d")}
                        >
                          7d % {sortKey === "7d" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`w-24 text-center text-xs text-muted-foreground font-medium px-1 py-3 cursor-pointer hover:text-foreground ${sortKey === "7d" ? "text-foreground" : ""}`}
                          title="Last 7 days price trend"
                          onClick={() => handleSort("7d")}
                        >
                          Last 7 Days {sortKey === "7d" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "value" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("value")}
                        >
                          Value (HKD) {sortKey === "value" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th
                          className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 cursor-pointer hover:text-foreground ${sortKey === "return" ? "text-foreground" : ""}`}
                          onClick={() => handleSort("return")}
                        >
                          Return {sortKey === "return" && (sortDir === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item) => {
                        if (item.kind === "summary") {
                          const g = item.group;
                          const isExpanded = expandedGroups.has(g.ticker);
                          const mv = g.totalValue;
                          const gain = g.totalGain;
                          const gainPct = g.gainPct;
                          const md = g.md;
                          const isAuto = true;
                          return (
                            <tr key={`group-${g.ticker}`} className="border-b border-border/50 bg-muted/10 hover:bg-muted/30 transition-colors" data-testid={`group-${g.ticker}`}>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <button
                                    onClick={() => toggleGroup(g.ticker)}
                                    className="p-0.5 text-base leading-none rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    aria-label={isExpanded ? "Collapse group" : "Expand group"}
                                  >
                                    {isExpanded ? "−" : "+"}
                                  </button>
                                  <div>
                                    <div className="font-medium text-foreground leading-tight">{g.ticker}</div>
                                    <div className="text-xs text-muted-foreground">{g.assets.length} accounts</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3"><Badge variant="secondary" className="text-xs capitalize">{ASSET_TYPE_LABELS[g.representative.assetType] ?? g.representative.assetType}</Badge></td>
                              <td className="px-3 py-3 text-muted-foreground text-xs">—</td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums">{g.totalQty.toLocaleString()}</td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">—</td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className="font-mono tabular-nums">{formatNativeCurrency(md?.price ?? g.representative.currentPrice, g.representative.currency)}</span>
                                </div>
                              </td>
                              {/* 1h % */}
                              <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                                {md?.change1h != null ? (
                                  <span className={md.change1h >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                    {md.change1h >= 0 ? "▲" : "▼"}{md.change1h.toFixed(2)}%
                                  </span>
                                ) : "—"}
                              </td>
                              {/* 24h % */}
                              <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                                {md?.change24h != null ? (
                                  <span className={md.change24h >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                    {md.change24h >= 0 ? "▲" : "▼"}{md.change24h.toFixed(2)}%
                                  </span>
                                ) : "—"}
                              </td>
                              {/* 7d % */}
                              <td className="px-2 py-3 text-right font-mono tabular-nums text-xs font-medium">
                                {md?.change7d != null ? (
                                  <span className={md.change7d >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                    {md.change7d >= 0 ? "▲" : "▼"}{md.change7d.toFixed(2)}%
                                  </span>
                                ) : "—"}
                              </td>
                              {/* 7d sparkline */}
                              <td className="px-1 py-3">
                                {md?.sparkline?.length ? (
                                  <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} />
                                ) : <span className="text-muted-foreground/60 text-[10px]">—</span>}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(mv)}</td>
                              <td className="px-3 py-3 text-right">
                                <div className={`font-mono tabular-nums text-xs font-medium ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                                  {gain >= 0 ? "+" : ""}{formatCurrency(gain)}
                                </div>
                                <div className={`text-xs font-mono ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{formatPct(gainPct)}</div>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => toggleGroup(g.ticker)}
                                  className="text-xs text-muted-foreground hover:text-foreground underline"
                                >
                                  {isExpanded ? "Collapse" : "Expand"}
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        // detail row
                        const a = item.asset;
                        const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                        const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
                        const gain = mv - cost;
                        const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                        const isRefreshing = refreshingId === a.id;
                        const md = marketData[a.id];
                        const isAuto = canAutoRefresh(a);
                        const isInGroup = item.groupTicker && !item.groupTicker.startsWith("single-");
                        return (
                          <tr key={a.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${isInGroup ? "bg-muted/5" : ""}`} data-testid={`holding-row-${a.id}`}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                  style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}>
                                  {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-foreground leading-tight">{a.name}</div>
                                  {a.ticker && <div className="text-xs text-muted-foreground">{a.ticker}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3"><Badge variant="secondary" className="text-xs capitalize">{ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}</Badge></td>
                            <td className="px-3 py-3 text-muted-foreground text-xs">{a.category ?? "—"}</td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">{a.quantity.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatNativeCurrency(a.purchasePrice, a.currency)}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="font-mono tabular-nums">{formatNativeCurrency((isAuto && md?.price != null ? md.price : a.currentPrice), a.currency)}</span>
                                {isAuto && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        data-testid={`refresh-price-${a.id}`}
                                        onClick={() => { setRefreshingId(a.id); refreshOneMutation.mutate(a.id); }}
                                        disabled={isRefreshing || refreshOneMutation.isPending}
                                        className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                                      >
                                        <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Refresh price (persisted current price)</p></TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            {/* 1h % */}
                            <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                              {isAuto && md?.change1h != null ? (
                                <span className={md.change1h >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                  {md.change1h >= 0 ? "▲" : "▼"}{md.change1h.toFixed(2)}%
                                </span>
                              ) : isAuto ? "—" : null}
                            </td>
                            {/* 24h % */}
                            <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                              {isAuto && md?.change24h != null ? (
                                <span className={md.change24h >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                  {md.change24h >= 0 ? "▲" : "▼"}{md.change24h.toFixed(2)}%
                                </span>
                              ) : isAuto ? "—" : null}
                            </td>
                            {/* 7d % */}
                            <td className="px-2 py-3 text-right font-mono tabular-nums text-xs font-medium">
                              {isAuto && md?.change7d != null ? (
                                <span className={md.change7d >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                  {md.change7d >= 0 ? "▲" : "▼"}{md.change7d.toFixed(2)}%
                                </span>
                              ) : isAuto ? "—" : null}
                            </td>
                            {/* 7d sparkline */}
                            <td className="px-1 py-3">
                              {isAuto && md?.sparkline?.length ? (
                                <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} />
                              ) : isAuto ? <span className="text-muted-foreground/60 text-[10px]">—</span> : null}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(mv)}</td>
                            <td className="px-3 py-3 text-right">
                              <div className={`font-mono tabular-nums text-xs font-medium ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                                {gain >= 0 ? "+" : ""}{formatCurrency(gain)}
                              </div>
                              <div className={`text-xs font-mono ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{formatPct(gainPct)}</div>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={`/holdings/${a.id}/edit`}>
                                  <Button size="icon" variant="ghost" data-testid={`edit-asset-${a.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                                </Link>
                                <DeleteButton asset={a} onDelete={() => deleteMutation.mutate(a.id)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-border">
                  {displayItems.map((item) => {
                    if (item.kind === "summary") {
                      const g = item.group;
                      const isExpanded = expandedGroups.has(g.ticker);
                      const mv = g.totalValue;
                      const cost = g.totalCost;
                      const gain = g.totalGain;
                      const gainPct = g.gainPct;
                      const md = g.md;
                      const isAuto = true;
                      return (
                        <div key={`group-${g.ticker}`} className="px-4 py-3 bg-muted/10" data-testid={`group-${g.ticker}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                onClick={() => toggleGroup(g.ticker)}
                                className="p-1 text-base leading-none rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                aria-label={isExpanded ? "Collapse group" : "Expand group"}
                              >
                                {isExpanded ? "−" : "+"}
                              </button>
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{g.ticker}</div>
                                <div className="text-xs text-muted-foreground">{g.assets.length} accounts</div>
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-sm font-mono font-semibold">{formatCurrency(mv, true)}</div>
                              <div className={`text-xs font-mono ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                                {formatPct(gainPct)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="capitalize text-xs">{ASSET_TYPE_LABELS[g.representative.assetType] ?? g.representative.assetType}</Badge>
                            <span className="text-muted-foreground">Total Qty: {g.totalQty.toLocaleString()}</span>
                            <button
                              onClick={() => toggleGroup(g.ticker)}
                              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                            >
                              {isExpanded ? "Collapse" : "Expand"}
                            </button>
                          </div>

                          {/* Compact market data for group */}
                          {md && (
                            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>1h % <span className={md.change1h != null && md.change1h >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change1h != null ? `${md.change1h >= 0 ? "+" : ""}${md.change1h.toFixed(1)}` : "—"}</span></span>
                              <span>24h % <span className={md.change24h != null && md.change24h >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change24h != null ? `${md.change24h >= 0 ? "+" : ""}${md.change24h.toFixed(1)}` : "—"}</span></span>
                              <span>7d % <span className={md.change7d != null && md.change7d >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change7d != null ? `${md.change7d >= 0 ? "+" : ""}${md.change7d.toFixed(1)}` : "—"}</span></span>
                              <span className="ml-auto -mr-0.5">
                                {md.sparkline?.length ? <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} width={46} height={15} /> : null}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // detail card
                    const a = item.asset;
                    const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                    const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
                    const gain = mv - cost;
                    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                    const isRefreshing = refreshingId === a.id;
                    const md = marketData[a.id];
                    const isAuto = canAutoRefresh(a);
                    const isInGroup = item.groupTicker && !item.groupTicker.startsWith("single-");
                    return (
                      <div key={a.id} className="px-4 py-3" data-testid={`holding-row-${a.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                              style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}>
                              {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground text-sm truncate">{a.name}</div>
                              <div className="text-xs text-muted-foreground">{a.ticker ?? a.category ?? ASSET_TYPE_LABELS[a.assetType]}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {canAutoRefresh(a) && (
                              <button
                                onClick={() => { setRefreshingId(a.id); refreshOneMutation.mutate(a.id); }}
                                disabled={isRefreshing || refreshOneMutation.isPending}
                                className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                              </button>
                            )}
                            <Link href={`/holdings/${a.id}/edit`}>
                              <Button size="icon" variant="ghost" data-testid={`edit-asset-${a.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                            </Link>
                            <DeleteButton asset={a} onDelete={() => deleteMutation.mutate(a.id)} />
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <div>
                            <div className="text-xs text-muted-foreground">Value</div>
                            <div className="text-sm font-mono font-semibold tabular-nums">{formatCurrency(mv, true)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Return</div>
                            <div className={`text-sm font-mono font-medium tabular-nums ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{formatPct(gainPct)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Current</div>
                            <div className="text-sm font-mono tabular-nums">{formatNativeCurrency((isAuto && md?.price != null ? md.price : a.currentPrice), a.currency)}</div>
                          </div>
                        </div>
                        {/* Compact market % + sparkline for auto-fetchable assets (mobile) */}
                        {isAuto && md && (
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>1h % <span className={md.change1h != null && md.change1h >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change1h != null ? `${md.change1h >= 0 ? "+" : ""}${md.change1h.toFixed(1)}` : "—"}</span></span>
                            <span>24h % <span className={md.change24h != null && md.change24h >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change24h != null ? `${md.change24h >= 0 ? "+" : ""}${md.change24h.toFixed(1)}` : "—"}</span></span>
                            <span>7d % <span className={md.change7d != null && md.change7d >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{md.change7d != null ? `${md.change7d >= 0 ? "+" : ""}${md.change7d.toFixed(1)}` : "—"}</span></span>
                            <span className="ml-auto -mr-0.5">
                              {md.sparkline?.length ? <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} width={46} height={15} /> : null}
                            </span>
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge variant="secondary" className="capitalize text-xs">{ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}</Badge>
                          {a.category && <span className="text-xs text-muted-foreground">{a.category}</span>}
                          <span className="ml-auto text-xs text-muted-foreground font-mono">Qty: {a.quantity.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Info banner for property/other */}
        {assets.some((a) => ["property", "other"].includes(a.assetType)) && (
          <p className="text-xs text-muted-foreground px-1">
            Property and Other assets require manual price updates — edit each asset to set the current price.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

function DeleteButton({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`delete-asset-${asset.id}`}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
          <AlertDialogDescription>This will permanently remove this asset and its data.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Lightweight SVG sparkline for last-7d price trend (index-based, oldest→newest). */
function Sparkline({
  data,
  positive = true,
  width = 72,
  height = 26,
}: {
  data: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) {
    return <div className="text-muted-foreground/50 text-[10px]">—</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Visible in both light/dark
  const color = positive ? "#16a34a" : "#dc2626";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
