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
import { insertLiabilitySchema } from "@shared/schema";
import type { Liability } from "@shared/schema";
import { useEffect } from "react";

const formSchema = insertLiabilitySchema.extend({
  balance: z.coerce.number().positive("Must be > 0"),
});

type FormData = z.infer<typeof formSchema>;

const LIABILITY_TYPES = [
  { value: "mortgage", label: "Mortgage" },
  { value: "loan", label: "Personal Loan" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

export default function AddEditLiability() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: existing } = useQuery<Liability>({
    queryKey: ["/api/liabilities", id],
    enabled: isEdit,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "mortgage",
      balance: 0,
      currency: "HKD",
      notes: "",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        name: existing.name,
        type: existing.type,
        balance: existing.balance,
        currency: existing.currency,
        notes: existing.notes ?? "",
      });
    }
  }, [existing, form]);

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("POST", "/api/liabilities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      toast({ title: "Liability added successfully" });
      navigate("/liabilities");
    },
    onError: () => {
      toast({ title: "Failed to add liability", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("PATCH", `/api/liabilities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities", id] });
      toast({ title: "Liability updated" });
      navigate("/liabilities");
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    const clean = {
      ...data,
      notes: data.notes || null,
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
          onClick={() => navigate("/liabilities")}
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{isEdit ? "Edit Liability" : "Add New Liability"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? "Update your liability details" : "Track a new liability"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Liability Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-liability-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LIABILITY_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input data-testid="input-name" placeholder="e.g. Home Mortgage, Auto Loan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Balance + Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Outstanding Balance *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-balance" type="number" step="any" placeholder="0.00" {...field} />
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
                  {isPending ? "Saving..." : isEdit ? "Update Liability" : "Add Liability"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/liabilities")}
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
