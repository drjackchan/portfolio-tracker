import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { Liability } from "@shared/schema";

const LIABILITY_TYPE_LABELS: Record<string, string> = {
  mortgage: "Mortgage", loan: "Personal Loan", credit_card: "Credit Card", other: "Other",
};
const LIABILITY_TYPE_COLORS: Record<string, string> = {
  mortgage: "hsl(var(--chart-1))", loan: "hsl(var(--chart-2))",
  credit_card: "hsl(var(--chart-3))", other: "hsl(var(--chart-5))",
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

const FILTER_TYPES = ["All", "mortgage", "loan", "credit_card", "other"] as const;

export default function Liabilities() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");

  const { data: liabilities = [], isLoading } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/liabilities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); toast({ title: "Liability deleted" }); },
    onError: () => { toast({ title: "Failed to delete", variant: "destructive" }); },
  });

  const filtered = liabilities.filter((l) => {
    const q = search.toLowerCase();
    return (
      (l.name.toLowerCase().includes(q) || (l.notes ?? "").toLowerCase().includes(q)) &&
      (filterType === "All" || l.type === filterType)
    );
  });

  const totalLiabilities = liabilities.reduce((s, l) => s + toHkd(l.balance, l.currency), 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Liabilities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your mortgages, loans, and credit cards</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/liabilities/new">
            <Button data-testid="add-liability-btn" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Add Liability</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Debt</div>
            <div className="text-2xl font-semibold font-mono">{formatCurrency(totalLiabilities)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search liabilities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {t === "All" ? "All" : LIABILITY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-muted-foreground text-sm">{liabilities.length === 0 ? "No liabilities yet." : "No matching liabilities."}</p>
              {liabilities.length === 0 && <Link href="/liabilities/new"><Button size="sm" variant="outline">Add your first liability</Button></Link>}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted-foreground font-medium px-5 py-3">Name</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Type</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Balance (Native)</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Balance (HKD)</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Notes</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => {
                      const hkdBalance = toHkd(l.balance, l.currency);
                      return (
                        <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                style={{ background: LIABILITY_TYPE_COLORS[l.type] ?? "#888" }}>
                                {l.name.slice(0, 3).toUpperCase()}
                              </div>
                              <div className="font-medium text-foreground leading-tight">{l.name}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><Badge variant="secondary" className="text-xs capitalize">{LIABILITY_TYPE_LABELS[l.type] ?? l.type}</Badge></td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatNativeCurrency(l.balance, l.currency)}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(hkdBalance)}</td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">{l.notes ?? "—"}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link href={`/liabilities/${l.id}/edit`}>
                                <Button size="icon" variant="ghost"><Pencil className="w-3.5 h-3.5" /></Button>
                              </Link>
                              <DeleteButton liability={l} onDelete={() => deleteMutation.mutate(l.id)} />
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
                {filtered.map((l) => {
                  const hkdBalance = toHkd(l.balance, l.currency);
                  return (
                    <div key={l.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ background: LIABILITY_TYPE_COLORS[l.type] ?? "#888" }}>
                            {l.name.slice(0, 3).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground text-sm truncate">{l.name}</div>
                            <Badge variant="secondary" className="mt-1 text-[10px] capitalize">{LIABILITY_TYPE_LABELS[l.type] ?? l.type}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Link href={`/liabilities/${l.id}/edit`}>
                            <Button size="icon" variant="ghost"><Pencil className="w-3.5 h-3.5" /></Button>
                          </Link>
                          <DeleteButton liability={l} onDelete={() => deleteMutation.mutate(l.id)} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div className="text-xs text-muted-foreground">
                          {l.currency !== "HKD" && <div className="font-mono">{formatNativeCurrency(l.balance, l.currency)}</div>}
                          {l.notes && <div className="mt-0.5 truncate max-w-[150px]">{l.notes}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Balance</div>
                          <div className="text-sm font-mono font-semibold tabular-nums">{formatCurrency(hkdBalance, true)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteButton({ liability, onDelete }: { liability: Liability; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {liability.name}?</AlertDialogTitle>
          <AlertDialogDescription>This will permanently remove this liability.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
