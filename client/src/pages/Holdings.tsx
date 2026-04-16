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
import { useState } from "react";
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

  const { data: assets = [], isLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  // Refresh ALL prices
  const refreshAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/prices/refresh"),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
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

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      (a.name.toLowerCase().includes(q) || (a.ticker ?? "").toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q)) &&
      (filterType === "All" || a.assetType === filterType)
    );
  });

  const refreshableCount = assets.filter(
    (a) => (a.assetType === "stock" || a.assetType === "crypto") && a.ticker
  ).length;

  const canAutoRefresh = (a: Asset) =>
    (a.assetType === "stock" || a.assetType === "crypto") && !!a.ticker;

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
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
                  <p>Auto-fetch latest prices for {refreshableCount} stock{refreshableCount !== 1 ? "s" : ""}/crypto</p>
                  <p className="text-xs text-muted-foreground">Yahoo Finance · CoinGecko</p>
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
                        <th className="text-left text-xs text-muted-foreground font-medium px-5 py-3">Asset</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Type</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Category</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Qty</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Buy Price</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Current</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Value (HKD)</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Return</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => {
                        const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                        const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
                        const gain = mv - cost;
                        const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                        const isRefreshing = refreshingId === a.id;
                        return (
                          <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`holding-row-${a.id}`}>
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
                                <span className="font-mono tabular-nums">{formatNativeCurrency(a.currentPrice, a.currency)}</span>
                                {canAutoRefresh(a) && (
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
                                    <TooltipContent><p>Fetch latest price</p></TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
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
                  {filtered.map((a) => {
                    const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                    const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
                    const gain = mv - cost;
                    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                    const isRefreshing = refreshingId === a.id;
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
                            <div className="text-sm font-mono tabular-nums">{formatNativeCurrency(a.currentPrice, a.currency)}</div>
                          </div>
                        </div>
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
        {assets.some((a) => ["property", "commodity", "other"].includes(a.assetType)) && (
          <p className="text-xs text-muted-foreground px-1">
            Property, Commodity, and Other assets require manual price updates — edit each asset to set the current price.
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
