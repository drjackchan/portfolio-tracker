import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { Asset } from "@shared/schema";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks",
  crypto: "Crypto",
  property: "Property",
  other: "Other",
};

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))",
  crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))",
  other: "hsl(var(--chart-5))",
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

function formatPct(val: number) {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

const FILTER_TYPES = ["All", "stock", "crypto", "property", "other"] as const;

export default function Holdings() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.name.toLowerCase().includes(q) ||
      (a.ticker ?? "").toLowerCase().includes(q) ||
      (a.category ?? "").toLowerCase().includes(q);
    const matchType = filterType === "All" || a.assetType === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Holdings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your assets</p>
        </div>
        <Link href="/holdings/new">
          <Button data-testid="add-asset-holdings-btn" size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Asset
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="search-input"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {FILTER_TYPES.map((t) => (
            <button
              key={t}
              data-testid={`filter-${t}`}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {t === "All" ? "All" : ASSET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-muted-foreground text-sm">{assets.length === 0 ? "No assets yet." : "No matching assets."}</p>
              {assets.length === 0 && (
                <Link href="/holdings/new">
                  <Button size="sm" variant="outline">Add your first asset</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted-foreground font-medium px-5 py-3">Asset</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Type</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Category</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Qty</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Buy Price</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Current</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Value</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Return</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const mv = a.quantity * a.currentPrice;
                    const cost = a.quantity * a.purchasePrice;
                    const gain = mv - cost;
                    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`holding-row-${a.id}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}
                            >
                              {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-foreground leading-tight">{a.name}</div>
                              {a.ticker && <div className="text-xs text-muted-foreground">{a.ticker}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">{a.category ?? "—"}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{a.quantity.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatCurrency(a.purchasePrice)}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(a.currentPrice)}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(mv)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className={`font-mono tabular-nums text-xs font-medium ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {gain >= 0 ? "+" : ""}{formatCurrency(gain)}
                          </div>
                          <div className={`text-xs font-mono ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {formatPct(gainPct)}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/holdings/${a.id}/edit`}>
                              <Button size="icon" variant="ghost" data-testid={`edit-asset-${a.id}`}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`delete-asset-${a.id}`}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {a.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this asset and its data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(a.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
