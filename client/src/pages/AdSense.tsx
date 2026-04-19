import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface AdSenseData {
  isConfigured: boolean;
  data: {
    today: number;
    thisMonth: number;
    lastMonth: number;
    currency: string;
  };
}

export default function AdSense() {
  const { data: adsense, isLoading } = useQuery<AdSenseData>({
    queryKey: ["/api/adsense/income"],
  });

  const formatCurrency = (val: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(val);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">AdSense Income</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your Google AdSense revenue</p>
        </div>
      </div>

      {!isLoading && adsense && !adsense.isConfigured && (
        <Alert variant="default" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Required</AlertTitle>
          <AlertDescription>
            The AdSense API requires OAuth 2.0 configuration. Please set the following environment variables: <code className="font-mono text-xs bg-yellow-500/20 px-1 py-0.5 rounded">GOOGLE_ADSENSE_CLIENT_ID</code>, <code className="font-mono text-xs bg-yellow-500/20 px-1 py-0.5 rounded">GOOGLE_ADSENSE_CLIENT_SECRET</code>, <code className="font-mono text-xs bg-yellow-500/20 px-1 py-0.5 rounded">GOOGLE_ADSENSE_REFRESH_TOKEN</code>, and <code className="font-mono text-xs bg-yellow-500/20 px-1 py-0.5 rounded">GOOGLE_ADSENSE_ACCOUNT_ID</code>. Showing dummy data for now.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today so far</span>
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold font-mono">
                {formatCurrency(adsense?.data.today ?? 0, adsense?.data.currency)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Month</span>
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold font-mono">
                {formatCurrency(adsense?.data.thisMonth ?? 0, adsense?.data.currency)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-sidebar-accent/50 border-sidebar-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Month</span>
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold font-mono">
                {formatCurrency(adsense?.data.lastMonth ?? 0, adsense?.data.currency)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">About Auto-Fetch</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            When configured with valid Google AdSense OAuth 2.0 credentials and Account ID, this page automatically fetches your estimated earnings data.
          </p>
          <p>
            The backend securely communicates with Google's servers without exposing your credentials to the browser. Once you fill in your environment variables, real data will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
