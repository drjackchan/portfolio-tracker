import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search, RefreshCw, Calendar, Tag, CreditCard } from "lucide-react";
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
import type { Subscription } from "@shared/schema";

const SUB_CATEGORY_COLORS: Record<string, string> = {
  Entertainment: "hsl(var(--chart-1))",
  Software: "hsl(var(--chart-2))",
  Utility: "hsl(var(--chart-3))",
  AI: "hsl(var(--chart-4))",
  VPN: "hsl(var(--chart-5))",
  Other: "hsl(var(--chart-6))",
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

const FILTER_CATEGORIES = ["All", "Entertainment", "Software", "Utility", "AI", "VPN", "Other"] as const;

export default function Subscriptions() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({ queryKey: ["/api/subscriptions"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/subscriptions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] }); toast({ title: "Subscription deleted" }); },
    onError: () => { toast({ title: "Failed to delete", variant: "destructive" }); },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      apiRequest("PATCH", `/api/subscriptions/${id}`, { status: status === "active" ? "inactive" : "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] }); },
  });

  const filtered = subscriptions.filter((s) => {
    const q = search.toLowerCase();
    return (
      (s.name.toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q)) &&
      (filterCategory === "All" || s.category === filterCategory)
    );
  });

  const activeSubs = subscriptions.filter(s => s.status === "active");

  const totalMonthlyHkd = activeSubs.reduce((sum, s) => {
    const amt = s.frequency === "monthly" ? s.amount : s.amount / 12;
    return sum + toHkd(amt, s.currency);
  }, 0);

  const totalYearlyHkd = totalMonthlyHkd * 12;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your recurring monthly and yearly fees</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/subscriptions/new">
            <Button data-testid="add-subscription-btn" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Add Subscription</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Monthly Cost</div>
              <div className="text-2xl font-semibold font-mono">{formatCurrency(totalMonthlyHkd)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estimated Yearly Cost</div>
              <div className="text-2xl font-semibold font-mono">{formatCurrency(totalYearlyHkd)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search subscriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-muted-foreground text-sm">{subscriptions.length === 0 ? "No subscriptions yet." : "No matching subscriptions."}</p>
              {subscriptions.length === 0 && <Link href="/subscriptions/new"><Button size="sm" variant="outline">Add your first subscription</Button></Link>}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted-foreground font-medium px-5 py-3">Service</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Category</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Frequency</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Amount (Native)</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Monthly (HKD)</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Next Bill</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Status</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const monthlyHkd = toHkd(s.frequency === "monthly" ? s.amount : s.amount / 12, s.currency);
                      return (
                        <tr key={s.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${s.status === "inactive" ? "opacity-60" : ""}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                style={{ background: SUB_CATEGORY_COLORS[s.category ?? "Other"] ?? "#888" }}>
                                {s.name.slice(0, 3).toUpperCase()}
                              </div>
                              <div className="font-medium text-foreground leading-tight">{s.name}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs">{s.category ?? "Other"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                              {s.frequency}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                            {formatNativeCurrency(s.amount, s.currency)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                            {formatCurrency(monthlyHkd)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">
                            {s.nextBillingDate ? new Date(s.nextBillingDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <button 
                              onClick={() => toggleStatusMutation.mutate({ id: s.id, status: s.status })}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                                s.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {s.status}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link href={`/subscriptions/${s.id}/edit`}>
                                <Button size="icon" variant="ghost"><Pencil className="w-3.5 h-3.5" /></Button>
                              </Link>
                              <DeleteButton sub={s} onDelete={() => deleteMutation.mutate(s.id)} />
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
                {filtered.map((s) => {
                  const monthlyHkd = toHkd(s.frequency === "monthly" ? s.amount : s.amount / 12, s.currency);
                  return (
                    <div key={s.id} className={`px-4 py-3 ${s.status === "inactive" ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ background: SUB_CATEGORY_COLORS[s.category ?? "Other"] ?? "#888" }}>
                            {s.name.slice(0, 3).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground text-sm truncate">{s.name}</div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Badge variant="secondary" className="text-[10px]">{s.category ?? "Other"}</Badge>
                              <Badge variant="outline" className="text-[10px] uppercase">{s.frequency}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Link href={`/subscriptions/${s.id}/edit`}>
                            <Button size="icon" variant="ghost"><Pencil className="w-3.5 h-3.5" /></Button>
                          </Link>
                          <DeleteButton sub={s} onDelete={() => deleteMutation.mutate(s.id)} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            <span>{formatNativeCurrency(s.amount, s.currency)} / {s.frequency === "monthly" ? "mo" : "yr"}</span>
                          </div>
                          {s.nextBillingDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>Next: {new Date(s.nextBillingDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Monthly</div>
                          <div className="text-sm font-mono font-semibold tabular-nums">{formatCurrency(monthlyHkd, true)}</div>
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

function DeleteButton({ sub, onDelete }: { sub: Subscription; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {sub.name}?</AlertDialogTitle>
          <AlertDialogDescription>This will permanently remove this subscription tracking.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
