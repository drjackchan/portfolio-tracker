import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { insertSubscriptionSchema } from "@shared/schema";
import type { Subscription } from "@shared/schema";
import { useEffect } from "react";

const formSchema = insertSubscriptionSchema.extend({
  amount: z.coerce.number().positive("Must be > 0"),
});

type FormData = z.infer<typeof formSchema>;

const SUB_CATEGORIES = [
  { value: "Entertainment", label: "Entertainment" },
  { value: "Software", label: "Software" },
  { value: "Utility", label: "Utility" },
  { value: "AI", label: "AI" },
  { value: "VPN", label: "VPN" },
  { value: "Other", label: "Other" },
];

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export default function AddEditSubscription() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: existing } = useQuery<Subscription>({
    queryKey: ["/api/subscriptions", id],
    enabled: isEdit,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      amount: 0,
      currency: "HKD",
      frequency: "monthly",
      category: "Software",
      nextBillingDate: new Date().toISOString().slice(0, 10),
      status: "active",
      notes: "",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        name: existing.name,
        amount: existing.amount,
        currency: existing.currency,
        frequency: existing.frequency as any,
        category: existing.category as any,
        nextBillingDate: existing.nextBillingDate ?? "",
        status: existing.status as any,
        notes: existing.notes ?? "",
      });
    }
  }, [existing, form]);

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("POST", "/api/subscriptions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Subscription added successfully" });
      navigate("/subscriptions");
    },
    onError: () => {
      toast({ title: "Failed to add subscription", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("PATCH", `/api/subscriptions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions", id] });
      toast({ title: "Subscription updated" });
      navigate("/subscriptions");
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    const clean = {
      ...data,
      notes: data.notes || null,
      nextBillingDate: data.nextBillingDate || null,
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
          onClick={() => navigate("/subscriptions")}
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{isEdit ? "Edit Subscription" : "Add New Subscription"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? "Update your subscription details" : "Track a new recurring fee"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Name *</FormLabel>
                    <FormControl>
                      <Input data-testid="input-name" placeholder="e.g. Netflix, ChatGPT, Mullvad VPN" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUB_CATEGORIES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Amount + Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-amount" type="number" step="any" placeholder="0.00" {...field} />
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

              {/* Frequency + Next Billing Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Frequency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-frequency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FREQUENCIES.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nextBillingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Billing Date</FormLabel>
                      <FormControl>
                        <Input data-testid="input-next-bill" type="date" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive (Paused)</SelectItem>
                      </SelectContent>
                    </Select>
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
                        placeholder="Optional notes..."
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
                  {isPending ? "Saving..." : isEdit ? "Update Subscription" : "Add Subscription"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/subscriptions")}
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
