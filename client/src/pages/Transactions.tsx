import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertTransactionSchema } from "@shared/schema";
import type { Asset, Transaction } from "@shared/schema";

const formSchema = insertTransactionSchema.extend({
  quantity: z.coerce.number().positive("Must be > 0"),
  price: z.coerce.number().positive("Must be > 0"),
  assetId: z.coerce.number().positive("Select an asset"),
});
type FormData = z.infer<typeof formSchema>;

const TX_TYPE_COLORS: Record<string, string> = {
  buy: "default", sell: "destructive", dividend: "secondary", rebalance: "outline",
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

export default function Transactions() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { assetId: 0, type: "buy", quantity: 1, price: 0, date: new Date().toISOString().slice(0, 10), notes: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("POST", "/api/transactions", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/transactions"] }); toast({ title: "Transaction recorded" }); setOpen(false); form.reset(); },
    onError: () => { toast({ title: "Failed to record transaction", variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/transactions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/transactions"] }); toast({ title: "Transaction deleted" }); },
  });

  const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Log buy, sell, and dividend events</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="add-transaction-btn">
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Add Transaction</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full">
            <DialogHeader>
              <DialogTitle>Record Transaction</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4 pt-2">
                <FormField control={form.control} name="assetId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset *</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value ? field.value.toString() : ""}>
                      <FormControl><SelectTrigger data-testid="select-tx-asset"><SelectValue placeholder="Select asset" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {assets.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}{a.ticker ? ` (${a.ticker})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-tx-type"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                          <SelectItem value="dividend">Dividend</SelectItem>
                          <SelectItem value="rebalance">Rebalance</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date *</FormLabel>
                      <FormControl><Input data-testid="input-tx-date" type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity *</FormLabel>
                      <FormControl><Input data-testid="input-tx-quantity" type="number" step="any" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price / unit *</FormLabel>
                      <FormControl><Input data-testid="input-tx-price" type="number" step="any" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Input data-testid="input-tx-notes" placeholder="Optional" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-3 pt-1">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="submit-tx-btn">
                    {createMutation.isPending ? "Saving..." : "Record"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-muted-foreground text-sm">No transactions logged yet.</p>
              <p className="text-muted-foreground text-xs">Add a buy, sell, or dividend event to build your history.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted-foreground font-medium px-5 py-3">Date</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Asset</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Type</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Qty</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Price</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-3">Total</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-3">Notes</th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((tx) => {
                      const asset = assetMap[tx.assetId];
                      return (
                        <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`tx-row-${tx.id}`}>
                          <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{tx.date}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-foreground leading-tight">{asset?.name ?? `Asset #${tx.assetId}`}</div>
                            {asset?.ticker && <div className="text-xs text-muted-foreground">{asset.ticker}</div>}
                          </td>
                          <td className="px-3 py-3"><Badge variant={(TX_TYPE_COLORS[tx.type] as any) ?? "secondary"} className="capitalize text-xs">{tx.type}</Badge></td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{tx.quantity.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatCurrency(tx.price)}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(tx.quantity * tx.price)}</td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">{tx.notes ?? "—"}</td>
                          <td className="px-5 py-3 text-right">
                            <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(tx.id)} data-testid={`delete-tx-${tx.id}`}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-border">
                {sorted.map((tx) => {
                  const asset = assetMap[tx.assetId];
                  return (
                    <div key={tx.id} className="px-4 py-3" data-testid={`tx-row-${tx.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={(TX_TYPE_COLORS[tx.type] as any) ?? "secondary"} className="capitalize text-xs">{tx.type}</Badge>
                            <span className="font-medium text-foreground text-sm truncate">{asset?.name ?? `Asset #${tx.assetId}`}</span>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{tx.date}{asset?.ticker ? ` · ${asset.ticker}` : ""}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-mono font-semibold tabular-nums">{formatCurrency(tx.quantity * tx.price)}</div>
                            <div className="text-xs text-muted-foreground font-mono">× {tx.quantity.toLocaleString()}</div>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(tx.id)} data-testid={`delete-tx-${tx.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {tx.notes && <div className="text-xs text-muted-foreground mt-1 truncate">{tx.notes}</div>}
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
