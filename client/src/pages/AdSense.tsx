import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, AlertCircle, RefreshCw, TestTube } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SourceData {
  today: number;
  thisMonth: number;
  lastMonth: number;
  currency: string;
}

interface RevenueData {
  isConfigured: boolean;
  adsense: SourceData | null;
  youtube: SourceData | null;
  errors?: string[];
}

interface TestResult {
  timestamp: string;
  adsense?: { configured: boolean; ok: boolean; message: string; sample?: number };
  youtube?: { configured: boolean; ok: boolean; message: string; sample?: number };
}

export default function AdSense() {
  const queryClient = useQueryClient();
  const { data: revenue, isLoading, error, isError, refetch } = useQuery<RevenueData>({
    queryKey: ["/api/adsense/income"],
  });

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const formatCurrency = (val: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(val);
  };

  const handleRefresh = () => {
    refetch();
    setTestResult(null);
  };

  const handleTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/adsense/test");
      if (!res.ok) throw new Error(await res.text());
      const json: TestResult = await res.json();
      setTestResult(json);
    } catch (e: any) {
      setTestResult({
        timestamp: new Date().toISOString(),
        adsense: { configured: false, ok: false, message: e.message || "Test failed" },
        youtube: { configured: false, ok: false, message: e.message || "Test failed" },
      });
    } finally {
      setTestLoading(false);
    }
  };

  const renderSourceCards = (label: string, source: SourceData | null) => {
    if (!source) return null;
    const cards = [
      { label: "Today so far", value: source.today },
      { label: "This Month", value: source.thisMonth },
      { label: "Last Month", value: source.lastMonth },
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="w-4 h-4" />
          {label} {source.currency !== "USD" && `(${source.currency})`}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <Card key={i} className="bg-sidebar-accent/50 border-sidebar-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</span>
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-primary" />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-semibold font-mono">
                    {formatCurrency(c.value, source.currency)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const hasAnyData = revenue && (revenue.adsense || revenue.youtube);
  const totalToday = (revenue?.adsense?.today || 0) + (revenue?.youtube?.today || 0);
  const totalThis = (revenue?.adsense?.thisMonth || 0) + (revenue?.youtube?.thisMonth || 0);
  const totalLast = (revenue?.adsense?.lastMonth || 0) + (revenue?.youtube?.lastMonth || 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Google Revenue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AdSense + YouTube estimated earnings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testLoading}>
            <TestTube className="w-4 h-4 mr-1" /> Test Connection
          </Button>
        </div>
      </div>

      {!isLoading && revenue && !revenue.isConfigured && (
        <Alert variant="default" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Required</AlertTitle>
          <AlertDescription>
            Set at least one of the following groups in your environment (Vercel or .env):
            <br />
            <strong>AdSense:</strong> <code>GOOGLE_ADSENSE_CLIENT_ID</code>, <code>GOOGLE_ADSENSE_CLIENT_SECRET</code>, <code>GOOGLE_ADSENSE_REFRESH_TOKEN</code>, <code>GOOGLE_ADSENSE_ACCOUNT_ID</code>
            <br />
            <strong>YouTube (reuses the refresh token):</strong> <code>GOOGLE_YOUTUBE_CHANNEL_ID</code> (use <code>MINE</code> or your <code>UC...</code> id)
            <br />
            The refresh token must include the <code>adsense.readonly</code> and (for YouTube) <code>yt-analytics-monetary.readonly</code> scopes.
          </AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load revenue data</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "An unknown error occurred. Check browser console and server logs for details."}
          </AlertDescription>
        </Alert>
      )}

      {revenue?.errors && revenue.errors.length > 0 && (
        <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Partial data — some sources failed</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            {revenue.errors.map((e, i) => <div key={i}>• {e}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* Totals (when both sources present) */}
      {hasAnyData && revenue?.adsense && revenue?.youtube && (
        <div className="space-y-1">
          <div className="text-sm font-medium">Combined (AdSense + YouTube)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Today so far", value: totalToday },
              { label: "This Month", value: totalThis },
              { label: "Last Month", value: totalLast },
            ].map((c, i) => (
              <Card key={i} className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-2xl font-semibold font-mono">{formatCurrency(c.value)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">approx — same currency assumed</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Per-source sections */}
      <div className="space-y-6">
        {renderSourceCards("AdSense (website)", revenue?.adsense || null)}
        {renderSourceCards("YouTube", revenue?.youtube || null)}
      </div>

      {!hasAnyData && !isLoading && revenue?.isConfigured && (
        <div className="text-sm text-muted-foreground">No revenue data returned for the configured sources (possible data delay or zero earnings in the periods).</div>
      )}

      {/* Test results */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TestTube className="w-4 h-4" /> Connection Test Results <span className="text-xs font-normal text-muted-foreground">({new Date(testResult.timestamp).toLocaleTimeString()})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3 font-mono">
            <div>
              <div className="font-medium text-foreground">AdSense</div>
              <div className={testResult.adsense?.ok ? "text-green-600" : "text-destructive"}>
                {testResult.adsense?.message || "Not tested"}
              </div>
            </div>
            <div>
              <div className="font-medium text-foreground">YouTube</div>
              <div className={testResult.youtube?.ok ? "text-green-600" : "text-destructive"}>
                {testResult.youtube?.message || "Not tested"}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground pt-2 border-t">
              Use these results + the server logs to debug credential / scope / account ID issues.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">About Auto-Fetch &amp; Setup</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Fetches <strong>estimated</strong> earnings using Google APIs. Data can have a 1-2 day delay and is not the final payout amount.
          </p>
          <p>
            The backend uses your stored refresh token to call the APIs server-side. No credentials are sent to the browser.
          </p>
          <p className="text-xs pt-1">
            <strong>Setup steps (do this once):</strong><br />
            1. In Google Cloud Console create OAuth 2.0 Client ID (Desktop app is easiest).<br />
            2. Go to <a href="https://developers.google.com/oauthplayground" target="_blank" className="underline">OAuth Playground</a>, select the two scopes above, authorize, then exchange for refresh token.<br />
            3. Enable the "AdSense Management API" (and "YouTube Analytics API" for YT revenue) in the same project.<br />
            4. Set the env vars (in Vercel: Project Settings → Environment Variables). Use the same refresh token for both AdSense and YouTube if you authorized both scopes.<br />
            5. Click "Test Connection" on this page to validate before expecting numbers.
          </p>
          <p className="text-xs pt-1 text-yellow-600 dark:text-yellow-400">
            YouTube revenue requires the monetary scope and a valid channel. AdSense v2 does not include most YouTube earnings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
