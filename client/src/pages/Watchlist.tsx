import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, X, RefreshCw, GripVertical, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkline } from "@/components/Sparkline";
import type { WatchlistItem } from "@shared/schema";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  crypto: "Crypto",
};

type MarketData = {
  price: number | null;
  change1h?: number | null;
  change24h?: number | null;
  change7d?: number | null;
  sparkline?: number[];
};

export default function Watchlist() {
  const { toast } = useToast();
  const [newSymbol, setNewSymbol] = useState("");
  const [newType, setNewType] = useState<"stock" | "crypto">("stock");
  const [newName, setNewName] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSymbol, setEditSymbol] = useState("");
  const [editType, setEditType] = useState<"stock" | "crypto">("stock");
  const [editName, setEditName] = useState("");

  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  // Fetch market data for the current watchlist symbols
  const symbolsForPrices = items.map((it) => ({
    symbol: it.symbol,
    assetType: it.assetType,
    currency: it.assetType === "crypto" ? "USD" : "HKD",
  }));

  const { data: pricesMap = {} as Record<string, MarketData>, isLoading: pricesLoading, refetch: refetchPrices } = useQuery<Record<string, MarketData>>({
    queryKey: ["/api/prices/market-data/symbols", symbolsForPrices],
    enabled: items.length > 0,
    queryFn: async () => {
      if (symbolsForPrices.length === 0) return {};
      const res = await apiRequest("POST", "/api/prices/market-data/symbols", { symbols: symbolsForPrices });
      return res.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const addMutation = useMutation({
    mutationFn: (data: { symbol: string; assetType: string; name?: string }) =>
      apiRequest("POST", "/api/watchlist", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setNewSymbol("");
      setNewName("");
      toast({ title: "Added to watchlist" });
    },
    onError: (error: any) => {
      console.error("Add watchlist error:", error);
      const message = error?.message || error?.response?.data?.message || "Failed to add. Check server logs.";
      toast({ title: message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/watchlist/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Removed from watchlist" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  // Local state for drag-and-drop reordering (optimistic)
  const [localItems, setLocalItems] = useState<WatchlistItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Keep local list in sync with server data (after adds, deletes, or initial load)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) =>
      apiRequest("POST", "/api/watchlist/reorder", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
      // Revert will happen automatically on invalidate (server truth wins)
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { symbol: string; assetType: string; name?: string } }) =>
      apiRequest("PATCH", `/api/watchlist/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setEditingId(null);
      setEditSymbol("");
      setEditName("");
      toast({ title: "Watchlist item updated" });
    },
    onError: (error: any) => {
      console.error("Update watchlist error:", error);
      const message = error?.message || error?.response?.data?.message || "Failed to update. Check server logs.";
      toast({ title: message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) {
      toast({ title: "Symbol is required", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      symbol,
      assetType: newType,
      name: newName.trim() || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  const startEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditSymbol(item.symbol);
    setEditType(item.assetType as "stock" | "crypto");
    setEditName(item.name || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSymbol("");
    setEditName("");
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const symbol = editSymbol.trim().toUpperCase();
    if (!symbol) {
      toast({ title: "Symbol is required", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingId,
      data: {
        symbol,
        assetType: editType,
        name: editName.trim() || undefined,
      },
    });
  };

  const formatPrice = (price: number | null | undefined, symbol: string, assetType: string) => {
    if (price == null) return "—";

    const s = symbol.toUpperCase().trim();
    const isIndex = s.startsWith('^');
    const isHKStock = assetType !== "crypto" && s.endsWith(".HK");

    if (isIndex) {
      // Indices — plain number, no unit
      return new Intl.NumberFormat("en-HK", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(price);
    }

    if (isHKStock) {
      // Only actual HK stocks get HK$
      return new Intl.NumberFormat("en-HK", {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: s.includes(".") || s.length > 5 ? 2 : (price < 10 ? 4 : 2),
      }).format(price);
    }

    // Crypto and non-HK stocks (e.g. NVDA) — USD with $
    const minFrac = price < 1 ? 4 : 2;
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: minFrac,
    }).format(price);
    return "$" + formatted;
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track prices for symbols you are watching</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchPrices()}
            disabled={pricesLoading}
            data-testid="refresh-watchlist-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${pricesLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Prices</span>
          </Button>
        </div>
      </div>

      {/* Add new symbol */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-muted-foreground mb-1">Symbol (e.g. AAPL, 0005.HK, BTC)</div>
              <Input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter ticker symbol"
                className="font-mono"
                data-testid="watchlist-symbol-input"
              />
            </div>
            <div className="w-full sm:w-40">
              <div className="text-sm text-muted-foreground mb-1">Type</div>
              <Select value={newType} onValueChange={(v: "stock" | "crypto") => setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock / ETF / Index</SelectItem>
                  <SelectItem value="crypto">Cryptocurrency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-muted-foreground mb-1">Name (optional)</div>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Friendly name"
                data-testid="watchlist-name-input"
              />
            </div>
            <Button onClick={handleAdd} disabled={addMutation.isPending} data-testid="add-to-watchlist-btn">
              <Plus className="w-4 h-4 mr-1.5" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            For Hong Kong stocks, use the Yahoo ticker format (e.g. 0005.HK). US stocks use regular tickers (AAPL, GOOGL).
          </p>
        </CardContent>
      </Card>

      {/* Watchlist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Tracked Symbols
            <span className="text-[10px] font-normal text-muted-foreground">— drag to reorder</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-14 bg-muted/50 rounded" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">Your watchlist is empty.</p>
              <p className="text-sm text-muted-foreground mt-1">Add symbols above to start tracking prices and charts.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {localItems.map((item, index) => {
                const upperSymbol = item.symbol.toUpperCase();
                const md = pricesMap[upperSymbol];
                const price = md?.price ?? null;
                const change = md?.change24h ?? md?.change7d ?? null; // prefer 24h
                const isUp = change !== null && change >= 0;
                const spark = md?.sparkline || [];
                const displayName = item.name || item.symbol.replace(/^\^/, '');
                const ticker = item.symbol.replace(/^\^/, '');

                const isDragging = draggedIndex === index;
                const isEditing = editingId === item.id;

                const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
                  if (isEditing) return;
                  setDraggedIndex(index);
                  e.dataTransfer.setData("text/plain", index.toString());
                  e.dataTransfer.effectAllowed = "move";
                };

                const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
                  if (isEditing) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                };

                const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
                  if (isEditing) return;
                  e.preventDefault();
                  const dragIndexStr = e.dataTransfer.getData("text/plain");
                  const dragIndex = parseInt(dragIndexStr, 10);
                  if (isNaN(dragIndex) || dragIndex === index) {
                    setDraggedIndex(null);
                    return;
                  }

                  const newOrder = [...localItems];
                  const [moved] = newOrder.splice(dragIndex, 1);
                  newOrder.splice(index, 0, moved);

                  setLocalItems(newOrder);
                  setDraggedIndex(null);

                  const orderedIds = newOrder.map((i) => i.id);
                  reorderMutation.mutate(orderedIds);
                };

                const handleDragEnd = () => {
                  setDraggedIndex(null);
                };

                return (
                  <div
                    key={item.id}
                    draggable={!isEditing}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center px-4 py-4 gap-3 hover:bg-muted/30 transition-colors ${isEditing ? "" : "cursor-grab active:cursor-grabbing"} ${isDragging ? "opacity-50 bg-muted/40" : ""}`}
                  >
                    {/* Drag handle - hidden while editing */}
                    {!isEditing && (
                      <div className="text-muted-foreground/70 hover:text-muted-foreground flex-shrink-0 py-1" title="Drag to reorder">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}

                    {isEditing ? (
                      /* Edit mode */
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row gap-2 items-end">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Symbol</div>
                          <Input
                            value={editSymbol}
                            onChange={(e) => setEditSymbol(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(); if (e.key === "Escape") cancelEdit(); }}
                            className="font-mono text-sm h-8"
                            placeholder="Symbol"
                          />
                        </div>
                        <div className="w-full sm:w-28">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Type</div>
                          <Select value={editType} onValueChange={(v: "stock" | "crypto") => setEditType(v)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stock">Stock</SelectItem>
                              <SelectItem value="crypto">Crypto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Name (opt)</div>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(); if (e.key === "Escape") cancelEdit(); }}
                            className="text-sm h-8"
                            placeholder="Name"
                          />
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" onClick={handleUpdate} disabled={updateMutation.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="font-semibold text-lg truncate">{displayName}</span>
                            {item.name && (
                              <span className="font-mono text-xs text-muted-foreground flex-shrink-0">
                                {ticker}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {ASSET_TYPE_LABELS[item.assetType] ?? item.assetType}
                          </div>
                        </div>

                        {/* Sparkline */}
                        <div className="w-24 h-9 flex-shrink-0">
                          {spark.length > 1 ? (
                            <Sparkline
                              data={spark}
                              positive={isUp}
                              width={96}
                              height={36}
                            />
                          ) : (
                            <div className="h-full w-full border border-dashed border-muted-foreground/30 rounded flex items-center justify-center text-xs text-muted-foreground/60">—</div>
                          )}
                        </div>

                        {/* Price & Change */}
                        <div className="text-right min-w-[100px]">
                          <div className="font-mono font-semibold tabular-nums text-lg">
                            {formatPrice(price, item.symbol, item.assetType)}
                          </div>
                          {change !== null ? (
                            <div className={`text-sm font-mono flex items-center justify-end gap-0.5 mt-0.5 ${isUp ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                              {isUp ? "▲" : "▼"} {change.toFixed(2)}%
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground mt-0.5">—</div>
                          )}
                        </div>

                        <button
                          onClick={() => startEdit(item)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          aria-label="Edit watchlist item"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                          aria-label="Remove from watchlist"
                          data-testid={`remove-watchlist-${item.id}`}
                          onDragStart={(e) => e.stopPropagation()}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground px-1">
        Prices and sparklines are fetched live. Add symbols you want to follow even if you don't own them in your portfolio.
      </p>
    </div>
  );
}
