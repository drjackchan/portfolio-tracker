import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertAssetSchema } from "@shared/schema";
import type { Asset } from "@shared/schema";
import { useEffect } from "react";

const formSchema = insertAssetSchema.extend({
  quantity: z.coerce.number().positive("Must be > 0"),
  purchasePrice: z.coerce.number().positive("Must be > 0"),
  currentPrice: z.coerce.number().positive("Must be > 0"),
});

type FormData = z.infer<typeof formSchema>;

const ASSET_TYPES = [
  { value: "stock", label: "Stock / ETF" },
  { value: "crypto", label: "Cryptocurrency" },
  { value: "property", label: "Property / Real Estate" },
  { value: "commodity", label: "Commodity (Gold, Silver, Oil, etc.)" },
  { value: "other", label: "Other (Bonds, Retirement, Cash, etc.)" },
];

export default function AddEditAsset() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const [, navigate] = useHashLocation();
  const { toast } = useToast();

  const { data: existing } = useQuery<Asset>({
    queryKey: ["/api/assets", id],
    enabled: isEdit,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      ticker: "",
      assetType: "stock",
      quantity: 1,
      purchasePrice: 0,
      currentPrice: 0,
      currency: "HKD",
      notes: "",
      purchaseDate: "",
      category: "",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        name: existing.name,
        ticker: existing.ticker ?? "",
        assetType: existing.assetType,
        quantity: existing.quantity,
        purchasePrice: existing.purchasePrice,
        currentPrice: existing.currentPrice,
        currency: existing.currency,
        notes: existing.notes ?? "",
        purchaseDate: existing.purchaseDate ?? "",
        category: existing.category ?? "",
      });
    }
  }, [existing, form]);

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset added successfully" });
      navigate("/holdings");
    },
    onError: () => {
      toast({ title: "Failed to add asset", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("PATCH", `/api/assets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", id] });
      toast({ title: "Asset updated" });
      navigate("/holdings");
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    const clean = {
      ...data,
      ticker: data.ticker || null,
      notes: data.notes || null,
      purchaseDate: data.purchaseDate || null,
      category: data.category || null,
    };
    if (isEdit) updateMutation.mutate(clean as any);
    else createMutation.mutate(clean as any);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/holdings")}
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{isEdit ? "Edit Asset" : "Add New Asset"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? "Update your investment details" : "Track a new investment"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Asset Type */}
              <FormField
                control={form.control}
                name="assetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-asset-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ASSET_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Name + Ticker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-name" placeholder="e.g. Apple Inc" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ticker"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticker / Symbol</FormLabel>
                      <FormControl>
                        <Input data-testid="input-ticker" placeholder="e.g. AAPL" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Category */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input data-testid="input-category" placeholder="e.g. Technology, Layer 1, Residential" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quantity + Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-quantity" type="number" step="any" placeholder="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="HKD">HKD</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="JPY">JPY</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                          <SelectItem value="SGD">SGD</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Price (per unit) *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-purchase-price" type="number" step="any" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currentPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Price (per unit) *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-current-price" type="number" step="any" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Purchase Date */}
              <FormField
                control={form.control}
                name="purchaseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Date</FormLabel>
                    <FormControl>
                      <Input data-testid="input-purchase-date" type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        data-testid="input-notes"
                        placeholder="Optional notes about this investment..."
                        rows={2}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="submit-btn"
                >
                  {isPending ? "Saving..." : isEdit ? "Update Asset" : "Add Asset"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/holdings")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
