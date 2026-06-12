import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";
import { TickerLogo } from "@/components/TickerLogo";
import { Sparkline } from "@/components/Sparkline";
import { AssetTable } from "@/components/AssetTable";
import { useAssetGrouping } from "@/hooks/useAssetGrouping";
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
import { toHkd } from "@/lib/utils";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks", crypto: "Crypto", property: "Property", other: "Other", commodity: "Commodities",
};
const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))", crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))", other: "hsl(var(--chart-5))",
  commodity: "hsl(var(--chart-6))",
};


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
  const { data: assets = [], isLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  type MarketData = {
    price: number | null;
    change1h: number | null;
    change24h: number | null;
    change7d: number | null;
    sparkline: number[];
    logo?: string | null;
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

  // Apply search + type filter
  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      (a.name.toLowerCase().includes(q) || (a.ticker ?? "").toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q)) &&
      (filterType === "All" || a.assetType === filterType)
    );
  });

  // Use shared grouping logic (supports the same sort keys and collapsed/expanded summaries)
  const { displayItems, expandedGroups, toggleGroup } = useAssetGrouping(
    filtered,
    marketData,
    sortKey,
    sortDir
  );

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
              <AssetTable
                items={displayItems}
                marketData={marketData}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                expandedGroups={expandedGroups}
                onToggleGroup={toggleGroup}
                onDelete={(asset) => deleteMutation.mutate(asset.id)}
                showActions={true}
                showCategory={true}
              />
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
