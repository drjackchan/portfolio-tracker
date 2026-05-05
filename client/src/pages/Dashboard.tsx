import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, Plus, DollarSign,
  BarChart3, Percent, RefreshCw, Camera,
  CalendarDays, CalendarRange, CreditCard, Briefcase, Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Sector,
} from "recharts";
import type { Asset, Liability } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type SortKey = 'value' | 'name' | 'type' | 'quantity' | 'cost' | 'current' | 'gain';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Snapshot {
  id: number;
  date: string;
  totalValue: number;
  totalCost: number;
  totalLiability: number;
  assetCount: number;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))",
  crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))",
  other: "hsl(var(--chart-5))",
  commodity: "hsl(var(--chart-6))",
};
const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks", crypto: "Crypto", property: "Property", other: "Other", commodity: "Commodities",
};

type Range = "30d" | "90d" | "1y" | "all";
const RANGE_DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "1y": 365, "all": 99999 };

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtCcy(val: number, compact = false) {
  if (compact && Math.abs(val) >= 1_000_000) return `HK$${(val / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(val) >= 1_000) return `HK$${(val / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(val);
}
function fmtPct(val: number) { return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-HK", { month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, positive, icon: Icon, loading, subLabel,
}: {
  title: string; value: string; sub?: string; positive?: boolean;
  icon: React.ComponentType<{ className?: string }>; loading?: boolean; subLabel?: string;
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{title}</span>
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
        </div>
        {loading ? <Skeleton className="h-7 w-28 mb-1" /> : (
          <div className="text-lg font-semibold font-mono tabular-nums">{value}</div>
        )}
        {sub && !loading && (
          <div className={`text-xs mt-0.5 font-mono flex items-center gap-1 ${
            positive === undefined ? "text-muted-foreground"
              : positive ? "text-green-600 dark:text-green-400" : "text-destructive"
          }`}>
            {sub}
            {subLabel && <span className="text-muted-foreground ml-1 font-sans">{subLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{payload[0].name}</p>
      <p className="text-muted-foreground">{fmtCcy(payload[0].value)}</p>
      <p className="text-muted-foreground">{payload[0].payload.pct?.toFixed(1)}%</p>
    </div>
  );
  return null;
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold font-mono text-foreground">{fmtCcy(payload[0].value)}</p>
    </div>
  );
  return null;
};

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("30d");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: liabilities = [], isLoading: liabLoading } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });
  const { data: snapshots = [], isLoading: snapsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
  });

  const isLoading = assetsLoading || liabLoading;

  // Mutations
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/prices/refresh"),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Prices updated", description: data?.message });
    },
    onError: () => toast({ title: "Failed to refresh prices", variant: "destructive" }),
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/snapshots"),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({
        title: "Snapshot saved",
        description: data?.date ? `Portfolio value recorded for ${data.date}` : "Snapshot saved",
      });
    },
    onError: () => toast({ title: "Failed to save snapshot", variant: "destructive" }),
  });

  // ── Derived metrics ─────────────────────────────────────────────────────────
  // HKD conversion (approx)
  const USD_RATE = 7.8;
  const toHkd = (v: number, ccy: string) => ccy === "USD" ? v * USD_RATE : v;

  const totalAssetsValue = assets.reduce((s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0);
  const totalCost  = assets.reduce((s, a) => s + toHkd(a.quantity * a.purchasePrice, a.currency), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + toHkd(l.balance, l.currency), 0);
  
  const totalNetWorth = totalAssetsValue - totalLiabilities;
  const totalGain  = totalAssetsValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Daily / monthly change from snapshots
  const sortedSnaps = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)); // oldest→newest

  function getSnapshotDaysAgo(days: number): Snapshot | undefined {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    const targetStr = targetDate.toISOString().slice(0, 10);
    // find closest snapshot on or before that date
    return [...sortedSnaps].reverse().find((s) => s.date <= targetStr);
  }

  const snap1d  = getSnapshotDaysAgo(1);
  const snap30d = getSnapshotDaysAgo(30);

  // We compute net worth for old snapshots using `s.totalValue - (s.totalLiability || 0)`
  const dailyChange  = snap1d  ? totalNetWorth - (snap1d.totalValue - (snap1d.totalLiability || 0)) : null;
  const monthlyChange = snap30d ? totalNetWorth - (snap30d.totalValue - (snap30d.totalLiability || 0)) : null;
  const dailyPct     = snap1d  && snap1d.totalValue  > 0 ? (dailyChange! / Math.abs(snap1d.totalValue - (snap1d.totalLiability || 0)))  * 100 : null;
  const monthlyPct   = snap30d && snap30d.totalValue > 0 ? (monthlyChange! / Math.abs(snap30d.totalValue - (snap30d.totalLiability || 0))) * 100 : null;

  // Allocation
  const allocationMap: Record<string, number> = {};
  for (const a of assets) {
    const v = toHkd(a.quantity * a.currentPrice, a.currency);
    allocationMap[a.assetType] = (allocationMap[a.assetType] ?? 0) + v;
  }
  const allocationData = Object.entries(allocationMap).map(([type, value]) => ({
    name: ASSET_TYPE_LABELS[type] ?? type,
    value, pct: totalAssetsValue > 0 ? (value / totalAssetsValue) * 100 : 0,
    color: ASSET_TYPE_COLORS[type] ?? "#888",
  })).sort((a, b) => b.value - a.value); // Sort largest to smallest

  // Top holdings
  const topHoldings = [...assets]
    .map((a) => ({
      ...a,
      value: toHkd(a.quantity * a.currentPrice, a.currency),
      gain: a.purchasePrice > 0 ? (a.currentPrice - a.purchasePrice) / a.purchasePrice * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc'); // default desc
    }
  };

  // Sorted assets for the table
  const sortedAssets = [...assets].sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (sortKey) {
      case 'value':
        aVal = toHkd(a.quantity * a.currentPrice, a.currency);
        bVal = toHkd(b.quantity * b.currentPrice, b.currency);
        break;
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'type':
        aVal = a.assetType;
        bVal = b.assetType;
        break;
      case 'quantity':
        aVal = a.quantity;
        bVal = b.quantity;
        break;
      case 'cost':
        aVal = toHkd(a.purchasePrice, a.currency);
        bVal = toHkd(b.purchasePrice, b.currency);
        break;
      case 'current':
        aVal = toHkd(a.currentPrice, a.currency);
        bVal = toHkd(b.currentPrice, b.currency);
        break;
      case 'gain': {
        const aMv = toHkd(a.quantity * a.currentPrice, a.currency);
        const aCost = toHkd(a.quantity * a.purchasePrice, a.currency);
        aVal = aMv - aCost;
        const bMv = toHkd(b.quantity * b.currentPrice, b.currency);
        const bCost = toHkd(b.quantity * b.purchasePrice, b.currency);
        bVal = bMv - bCost;
        break;
      }
      default:
        return 0;
    }
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    } else {
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    }
  });

  // Chart data — filter by selected range, oldest→newest for display
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const chartData = sortedSnaps
    .filter((s) => range === "all" || s.date >= cutoffStr)
    .map((s) => ({ date: fmtDate(s.date), value: s.totalValue - (s.totalLiability || 0), rawDate: s.date }));

  // Replace today's snapshot value with the live Net Worth so it doesn't look broken when users add liabilities
  const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  if (chartData.length > 0 && chartData[chartData.length - 1].rawDate === todayStr) {
    chartData[chartData.length - 1].value = totalNetWorth;
  } else {
    chartData.push({ date: "Today", value: totalNetWorth, rawDate: todayStr });
  }

  const refreshableCount = assets.filter(
    (a) => (a.assetType === "stock" || a.assetType === "crypto") && a.ticker
  ).length;

  // Chart Y-axis domain with 5% padding
  const chartMin = chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) * 0.95 : 0;
  const chartMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) * 1.05 : 100;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Portfolio Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your complete investment picture</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isLoading && refreshableCount > 0 && (
            <Button variant="outline" size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending} data-testid="dashboard-refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{refreshMutation.isPending ? "Refreshing…" : "Refresh Prices"}</span>
              <span className="sm:hidden">{refreshMutation.isPending ? "…" : "Refresh"}</span>
            </Button>
          )}
          <Button variant="outline" size="sm"
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending} data-testid="snapshot-btn"
          >
            <Camera className={`w-4 h-4 mr-1.5 ${snapshotMutation.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{snapshotMutation.isPending ? "Saving…" : "Take Snapshot"}</span>
            <span className="sm:hidden">Snap</span>
          </Button>
          <Link href="/holdings/new">
            <Button size="sm" data-testid="add-asset-btn">
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Add Asset</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards — 2 cols mobile, 4 on sm, 7 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard title="Net Worth" value={isLoading ? "—" : fmtCcy(totalNetWorth, true)} icon={DollarSign} loading={isLoading} />
        <KpiCard title="Total Assets" value={isLoading ? "—" : fmtCcy(totalAssetsValue, true)} icon={Briefcase} loading={isLoading} />
        <KpiCard title="Total Debt" value={isLoading ? "—" : fmtCcy(totalLiabilities, true)} icon={CreditCard} loading={isLoading} />
        <KpiCard
          title="Assets Gain"
          value={isLoading ? "—" : fmtCcy(totalGain, true)}
          sub={isLoading ? undefined : fmtPct(totalGainPct)}
          subLabel="vs cost"
          positive={totalGain >= 0}
          icon={totalGain >= 0 ? TrendingUp : TrendingDown}
          loading={isLoading}
        />
        <KpiCard
          title="Daily"
          value={dailyChange === null ? (snapsLoading ? "—" : "No data") : fmtCcy(dailyChange, true)}
          sub={dailyPct !== null ? fmtPct(dailyPct) : undefined}
          subLabel={snap1d ? `vs ${snap1d.date}` : undefined}
          positive={dailyChange !== null ? dailyChange >= 0 : undefined}
          icon={CalendarDays}
          loading={isLoading || snapsLoading}
        />
        <KpiCard
          title="30-Day"
          value={monthlyChange === null ? (snapsLoading ? "—" : "No data") : fmtCcy(monthlyChange, true)}
          sub={monthlyPct !== null ? fmtPct(monthlyPct) : undefined}
          subLabel={snap30d ? `vs ${snap30d.date}` : undefined}
          positive={monthlyChange !== null ? monthlyChange >= 0 : undefined}
          icon={CalendarRange}
          loading={isLoading || snapsLoading}
        />
        <KpiCard
          title="Safe Spending"
          value={isLoading ? "—" : fmtCcy(totalNetWorth * 0.04 / 12, true)}
          sub={isLoading ? undefined : fmtCcy(totalNetWorth * 0.04, true)}
          subLabel="annual (4%)"
          icon={Percent}
          loading={isLoading}
        />
      </div>

      {/* Portfolio Value Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">Net Worth History</CardTitle>
            <div className="flex items-center gap-1">
              {(["30d","90d","1y","all"] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 pb-4">
          {snapsLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : chartData.length < 2 ? (
            <div className="h-52 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <BarChart3 className="w-8 h-8 opacity-30" />
              <p>No history yet.</p>
              <p className="text-xs">Click <strong>Take Snapshot</strong> to record today's net worth — the daily cron will do it automatically every night.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
                <YAxis
                  domain={[chartMin, chartMax]}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={(v) => `HK$${(v / 1000).toFixed(0)}K`}
                  width={64}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="value"
                  stroke="hsl(var(--primary))" strokeWidth={2}
                  fill="url(#valueGrad)" dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Allocation + Top Holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {isLoading ? <Skeleton className="h-64 w-full" /> :
             allocationData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No assets yet</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 justify-center py-2">
                <div className="flex-shrink-0">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie 
                        data={allocationData} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={65} 
                        outerRadius={95} 
                        paddingAngle={3} 
                        dataKey="value"
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                        stroke="none"
                      >
                        {allocationData.map((e, i) => <Cell key={i} fill={e.color} className="transition-all duration-300 ease-in-out cursor-pointer" />)}
                      </Pie>
                      <ReTooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2 flex-1 min-w-0 w-full max-w-[280px]">
                  {allocationData.map((d, i) => (
                    <li 
                      key={d.name} 
                      className={`flex items-center justify-between p-2.5 rounded-lg transition-all cursor-pointer ${
                        activePieIndex === i ? "bg-sidebar-accent shadow-sm scale-[1.02]" : "hover:bg-muted/50"
                      }`}
                      onMouseEnter={() => setActivePieIndex(i)}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm" style={{ background: d.color }} />
                        <span className="text-sm font-medium text-foreground truncate">{d.name}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="text-sm font-semibold font-mono tabular-nums leading-tight">{fmtCcy(d.value, true)}</div>
                        <div className="text-xs font-mono text-muted-foreground">{d.pct.toFixed(1)}%</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Holdings (HKD equiv.)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : topHoldings.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
                <TrendingUp className="w-8 h-8 opacity-30" />
                <p>No holdings yet.</p>
                <Link href="/holdings/new"><Button size="sm" variant="outline">Add Asset</Button></Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {topHoldings.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}>
                      {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.ticker ?? ASSET_TYPE_LABELS[a.assetType]}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium tabular-nums">{fmtCcy(a.value, true)}</div>
                      <div className={`text-xs font-mono ${a.gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{fmtPct(a.gain)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Holdings table — desktop only */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">All Holdings</CardTitle>
            <Link href="/holdings"><Button variant="ghost" size="sm" className="text-xs">Manage →</Button></Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : assets.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No assets found.</div>
          ) : (
            <>
              {(() => {
                const headers = [
                  { label: "Asset", key: "name" as SortKey, sortable: true, align: "left" as const },
                  { label: "Type", key: "type" as SortKey, sortable: true, align: "left" as const },
                  { label: "Qty", key: "quantity" as SortKey, sortable: true, align: "right" as const },
                  { label: "Cost Price", key: "cost" as SortKey, sortable: true, align: "right" as const },
                  { label: "Current", key: "current" as SortKey, sortable: true, align: "right" as const },
                  { label: "Value (HKD)", key: "value" as SortKey, sortable: true, align: "right" as const },
                  { label: "Gain/Loss", key: "gain" as SortKey, sortable: true, align: "right" as const },
                ];
                return (
                  <>
                    {/* Desktop sortable table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            {headers.map((h, i) => (
                              <th
                                key={h.label}
                                className={`text-xs text-muted-foreground font-medium px-${i === 0 || i === 6 ? 5 : 3} py-2.5 ${
                                  h.align === "right" ? "text-right" : "text-left"
                                } ${h.sortable ? "cursor-pointer hover:text-foreground" : ""}`}
                                onClick={h.sortable ? () => handleSort(h.key) : undefined}
                              >
                                {h.label}
                                {sortKey === h.key && (sortDir === "asc" ? " ↑" : " ↓")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedAssets.map((a) => {
                            const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                            const totalCost = toHkd(a.quantity * a.purchasePrice, a.currency);
                            const gain = mv - totalCost;
                            const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
                            return (
                              <tr
                                key={a.id}
                                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                data-testid={`row-asset-${a.id}`}
                              >
                                <td className="px-5 py-3">
                                  <div className="font-medium">{a.name}</div>
                                  {a.ticker && <div className="text-xs text-muted-foreground">{a.ticker}</div>}
                                </td>
                                <td className="px-3 py-3">
                                  <Badge variant="secondary" className="capitalize text-xs">
                                    {ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}
                                  </Badge>
                                </td>
                                <td className="px-3 py-3 text-right font-mono tabular-nums">
                                  {a.quantity.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                                  {a.currency !== "HKD" ? `${a.currency} ` : ""}{a.purchasePrice.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right font-mono tabular-nums">
                                  {a.currency !== "HKD" ? `${a.currency} ` : ""}{a.currentPrice.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right font-mono tabular-nums font-medium">
                                  {fmtCcy(mv)}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <div
                                    className={`font-mono tabular-nums font-medium ${
                                      gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                                    }`}
                                  >
                                    {fmtCcy(gain)}
                                  </div>
                                  <div
                                    className={`text-xs font-mono ${
                                      gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                                    }`}
                                  >
                                    {fmtPct(gainPct)}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards — now sorted */}
                    <div className="sm:hidden divide-y divide-border">
                      {sortedAssets.map((a) => {
                        const mv = toHkd(a.quantity * a.currentPrice, a.currency);
                        const totalCost = toHkd(a.quantity * a.purchasePrice, a.currency);
                        const gain = mv - totalCost;
                        const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
                        return (
                          <div key={a.id} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                  style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}
                                >
                                  {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{a.name}</div>
                                  {a.ticker && <div className="text-xs text-muted-foreground">{a.ticker}</div>}
                                </div>
                              </div>
                              <div className="text-right ml-2">
                                <div className="text-sm font-mono font-semibold">{fmtCcy(mv, true)}</div>
                                <div
                                  className={`text-xs font-mono ${
                                    gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                                  }`}
                                >
                                  {fmtPct(gainPct)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="capitalize text-xs">
                                {ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Qty: {a.quantity.toLocaleString()}</span>
                              <span className="ml-auto text-xs text-muted-foreground font-mono">
                                {a.currency !== "HKD" ? a.currency : "HK$"}{a.currentPrice.toLocaleString()} / unit
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}