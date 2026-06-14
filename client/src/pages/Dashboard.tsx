import { useQuery, useMutation } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, DollarSign,
  BarChart3, Percent, RefreshCw, Camera,
  CalendarDays, CalendarRange, CreditCard, Briefcase, Wallet,
  Home, Coins, Gem, Folder
} from "lucide-react";
import { toHkd } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/Sparkline";
import { AssetTable } from "@/components/AssetTable";
import { useAssetGrouping } from "@/hooks/useAssetGrouping";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Sector,
} from "recharts";
import type { Asset, Liability } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type SortKey = 'value' | 'name' | 'type' | 'quantity' | 'cost' | 'current' | 'gain' | '1h' | '24h' | '7d' | 'spark';

type MarketData = {
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  sparkline: number[];
  logo?: string | null;
};

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
  cash: "hsl(var(--chart-1))",
  other: "hsl(var(--chart-5))",
  commodity: "hsl(var(--chart-6))",
};
const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks", crypto: "Crypto", property: "Property", cash: "Cash", other: "Other", commodity: "Commodities",
};

const FILTER_TYPES = ["All", "stock", "crypto", "property", "cash", "commodity", "other"] as const;

const ASSET_TYPE_ICONS: Record<string, ComponentType<any>> = {
  stock: BarChart3,
  crypto: Coins,
  property: Home,
  cash: Wallet,
  commodity: Gem,
  other: Folder,
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

function formatNewsTime(iso: string) {
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString("en-HK", { month: "short", day: "numeric" });
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
              : positive ? "text-[hsl(var(--positive))]" : "text-destructive"
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

const renderPieIconLabel = (entry: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, payload, percent } = entry;
  if (!payload?.type || (percent || 0) < 0.04) return null; // hide on tiny slices to avoid clutter

  const Icon = ASSET_TYPE_ICONS[payload.type] || Folder;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <g>
      <foreignObject
        x={x - 8}
        y={y - 8}
        width={16}
        height={16}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: '16px', 
          height: '16px' 
        }}>
          <Icon 
            style={{ 
              width: '13px', 
              height: '13px', 
              color: '#fff',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' 
            }} 
          />
        </div>
      </foreignObject>
    </g>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("30d");
  const [activePieIndex, setActivePieIndex] = useState(-1);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>("All");

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: liabilities = [], isLoading: liabLoading } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });
  const { data: snapshots = [], isLoading: snapsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
  });
  const { data: marketData = {} as Record<number, MarketData> } = useQuery<Record<number, MarketData>>({
    queryKey: ["/api/prices/market-data"],
    enabled: assets.length > 0,
    staleTime: 1000 * 60 * 3,
    refetchOnWindowFocus: false,
  });

  // Crypto & financial market news
  const { data: news = [], isLoading: newsLoading } = useQuery<Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    imageUrl?: string | null;
  }>>({
    queryKey: ["/api/news"],
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const isLoading = assetsLoading || liabLoading;

  // Mutations
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/prices/refresh"),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prices/market-data"] });
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

  const totalAssetsValue = assets.reduce((s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0);
  const totalCost  = assets.reduce((s, a) => s + toHkd(a.quantity * a.purchasePrice, a.currency), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + toHkd(l.balance, l.currency), 0);
  
  const totalNetWorth = totalAssetsValue - totalLiabilities;
  const totalCash = assets
    .filter((a) => a.assetType === "cash")
    .reduce((s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0);

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
    type,
    name: ASSET_TYPE_LABELS[type] ?? type,
    value, pct: totalAssetsValue > 0 ? (value / totalAssetsValue) * 100 : 0,
    color: ASSET_TYPE_COLORS[type] ?? "#888",
  })).sort((a, b) => b.value - a.value); // Sort largest to smallest

  const handleSort = (key: string) => {
    const k = key as SortKey;
    if (sortKey === k) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      setSortDir('desc'); // default desc
    }
  };

  // Grouped display items (reuses the same grouping + group-level sorting logic as the full Assets page)
  const filteredAssets = filterType === "All" ? assets : assets.filter((a) => a.assetType === filterType);
  const { displayItems, expandedGroups, toggleGroup } = useAssetGrouping(
    filteredAssets,
    marketData,
    sortKey,
    sortDir
  );

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
    (a) => (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && a.ticker
  ).length;

  // Chart Y-axis domain with 5% padding
  const chartMin = chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) * 0.95 : 0;
  const chartMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) * 1.05 : 100;

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
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
        </div>
      </div>

      {/* KPI Cards — 2 cols mobile, 4 on sm, 6 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard
          title="Net Worth"
          value={isLoading ? "—" : fmtCcy(totalNetWorth, true)}
          sub={dailyChange === null ? undefined : `${fmtCcy(dailyChange, true)}${dailyPct !== null ? ` ${fmtPct(dailyPct)}` : ''}`}
          subLabel={snap1d ? `vs ${snap1d.date}` : undefined}
          positive={dailyChange !== null ? dailyChange >= 0 : undefined}
          icon={DollarSign}
          loading={isLoading}
        />
        <KpiCard title="Total Assets" value={isLoading ? "—" : fmtCcy(totalAssetsValue, true)} icon={Briefcase} loading={isLoading} />
        <KpiCard title="Total Debt" value={isLoading ? "—" : fmtCcy(totalLiabilities, true)} icon={CreditCard} loading={isLoading} />
        <KpiCard
          title="Cash"
          value={isLoading ? "—" : fmtCcy(totalCash, true)}
          icon={Wallet}
          loading={isLoading}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Asset Allocation (left) */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {isLoading ? <Skeleton className="h-64 w-full" /> :
             allocationData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No assets yet</div>
            ) : (
              <div 
                className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 justify-center py-2 w-full !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0 [&_.recharts-pie-sector]:!outline-none [&_.recharts-pie-sector]:focus:!outline-none [&_.recharts-pie-sector_path]:!outline-none [&_.recharts-pie-sector_path]:focus:!outline-none [&_path]:!outline-none [&_path]:focus:!outline-none"
                onMouseLeave={() => setActivePieIndex(-1)}
                tabIndex={-1}
              >
                <div className="flex-shrink-0 mx-auto w-full max-w-[300px] aspect-square sm:mx-0 sm:w-[260px] sm:max-w-none sm:aspect-auto sm:h-[260px] relative !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0 [&_.recharts-pie-sector]:!outline-none [&_.recharts-pie-sector]:focus:!outline-none [&_.recharts-pie-sector_path]:!outline-none [&_.recharts-pie-sector_path]:focus:!outline-none [&_path]:!outline-none [&_path]:focus:!outline-none" tabIndex={-1}>
                  <ResponsiveContainer width="100%" height="100%" className="!outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0">
                    <PieChart className="!outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0">
                      <Pie 
                        data={allocationData} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={72} 
                        outerRadius={105} 
                        paddingAngle={3} 
                        dataKey="value"
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                        onMouseLeave={() => setActivePieIndex(-1)}
                        stroke="none"
                        label={renderPieIconLabel}
                        labelLine={false}
                      >
                        {allocationData.map((e, i) => <Cell key={i} fill={e.color} tabIndex={-1} className="transition-all duration-300 ease-in-out cursor-pointer !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0" />)}
                      </Pie>
                      <ReTooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Net worth value in the center of the donut */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums leading-none">
                        {fmtCcy(totalNetWorth, true)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legend: full-width on mobile, beside pie on desktop */}
                <div 
                  className="w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:max-w-none space-y-0.5 text-sm !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0"
                  onMouseLeave={() => setActivePieIndex(-1)}
                >
                  {allocationData.map((d, i) => {
                    const Icon = ASSET_TYPE_ICONS[d.type] || Folder;
                    const isActive = i === activePieIndex;
                    const valueStr = fmtCcy(d.value, true);
                    const pctStr = `${d.pct.toFixed(1)}%`;

                    if (isActive) {
                      return (
                        <div 
                          key={d.name} 
                          className="flex items-center justify-between rounded-2xl bg-sidebar-accent shadow-sm scale-[1.02] px-3 py-2 cursor-pointer !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0" tabIndex={-1}
                          onMouseEnter={() => setActivePieIndex(i)}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" style={{ color: d.color }} />
                            <span className="font-medium text-foreground">{d.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold tabular-nums text-[13px]">{valueStr}</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums leading-none">{pctStr}</div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={d.name} 
                        className="flex items-center justify-between px-1 py-1 rounded hover:bg-muted/50 cursor-pointer !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0 !ring-offset-0 focus:!ring-offset-0 focus-visible:!ring-offset-0" tabIndex={-1}
                        onMouseEnter={() => setActivePieIndex(i)}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-[13px] font-medium tabular-nums">{valueStr}</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums leading-none">{pctStr}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Net Worth History (right) */}
        <Card className="flex flex-col">
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
          <CardContent className="flex-1 min-h-0 flex flex-col px-2 sm:px-4 pb-4">
            {snapsLoading ? (
              <Skeleton className="flex-1 min-h-[220px] w-full" />
            ) : chartData.length < 2 ? (
              <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <BarChart3 className="w-8 h-8 opacity-30" />
                <p>No history yet.</p>
                <p className="text-xs">Click <strong>Take Snapshot</strong> to record today's net worth — the daily cron will do it automatically every night.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
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
                      tickFormatter={(v) => {
                        const abs = Math.abs(v);
                        if (abs >= 1_000_000) return `HK$${(v / 1_000_000).toFixed(1)}M`;
                        if (abs >= 1_000) return `HK$${(v / 1_000).toFixed(0)}K`;
                        return `HK$${v.toFixed(0)}`;
                      }}
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Crypto & Financial Market News */}
      <Card className="mt-4 sm:mt-6">
        <CardHeader className="pb-1.5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Crypto & Market News</CardTitle>
            <span className="text-[10px] text-muted-foreground">Latest headlines</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {newsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-muted/40 rounded" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">No news available at the moment.</div>
          ) : (
            <div className="divide-y divide-border text-sm">
              {news.slice(0, 5).map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 px-4 py-3 hover:bg-muted/60 transition-colors group"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-9 h-9 rounded object-cover flex-shrink-0 bg-muted ring-1 ring-border/50"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight line-clamp-2 group-hover:underline text-[13px]">
                      {item.title}
                    </div>
                    <div className="mt-1 flex items-center gap-x-1.5 text-[10px] text-muted-foreground">
                      <span className="truncate">{item.source}</span>
                      <span className="text-muted-foreground/60">•</span>
                      <span>{formatNewsTime(item.publishedAt)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap px-4 py-2 border-b border-border/50 bg-muted/10">
                {FILTER_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      filterType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "All" ? "All" : ASSET_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              {filteredAssets.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">
                  {filterType === "All" ? "No assets found." : `No assets found in ${ASSET_TYPE_LABELS[filterType]}.`}
                </div>
              ) : (
                (() => {
                  return (
                    <AssetTable
                      items={displayItems}
                      marketData={marketData}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      expandedGroups={expandedGroups}
                      onToggleGroup={toggleGroup}
                      showActions={false}
                      showBuyPrice={true}
                      compact={true}
                    />
                  );
                })()
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}