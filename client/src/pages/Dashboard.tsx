import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { TrendingUp, TrendingDown, Plus, DollarSign, BarChart3, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import type { Asset } from "@shared/schema";

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))",
  crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))",
  other: "hsl(var(--chart-5))",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks",
  crypto: "Crypto",
  property: "Property",
  other: "Other",
};

function formatCurrency(val: number, compact = false) {
  if (compact && Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

function formatPct(val: number) {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function KpiCard({
  title,
  value,
  sub,
  positive,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-32 mb-1" />
        ) : (
          <div className="text-xl font-semibold font-mono tabular-nums">{value}</div>
        )}
        {sub && !loading && (
          <div className={`text-xs mt-1 font-mono ${positive === undefined ? "text-muted-foreground" : positive ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CUSTOM_TOOLTIP = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
        <p className="font-medium text-foreground">{payload[0].name}</p>
        <p className="text-muted-foreground">{formatCurrency(payload[0].value)}</p>
        <p className="text-muted-foreground">{payload[0].payload.pct?.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  // Compute derived metrics
  const totalValue = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
  const totalCost = assets.reduce((s, a) => s + a.quantity * a.purchasePrice, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Allocation by asset type
  const allocationMap: Record<string, number> = {};
  for (const a of assets) {
    const v = a.quantity * a.currentPrice;
    allocationMap[a.assetType] = (allocationMap[a.assetType] ?? 0) + v;
  }
  const allocationData = Object.entries(allocationMap).map(([type, value]) => ({
    name: ASSET_TYPE_LABELS[type] ?? type,
    value,
    pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    color: ASSET_TYPE_COLORS[type] ?? "#888",
  }));

  // Top 5 holdings by value
  const topHoldings = [...assets]
    .map((a) => ({
      ...a,
      value: a.quantity * a.currentPrice,
      gain: (a.currentPrice - a.purchasePrice) / a.purchasePrice * 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Portfolio Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your complete investment picture</p>
        </div>
        <Link href="/holdings/new">
          <Button data-testid="add-asset-btn" size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Asset
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Value"
          value={isLoading ? "—" : formatCurrency(totalValue, true)}
          icon={DollarSign}
          loading={isLoading}
        />
        <KpiCard
          title="Total Gain / Loss"
          value={isLoading ? "—" : formatCurrency(totalGain, true)}
          sub={isLoading ? undefined : formatPct(totalGainPct)}
          positive={totalGain >= 0}
          icon={totalGain >= 0 ? TrendingUp : TrendingDown}
          loading={isLoading}
        />
        <KpiCard
          title="Total Cost"
          value={isLoading ? "—" : formatCurrency(totalCost, true)}
          icon={BarChart3}
          loading={isLoading}
        />
        <KpiCard
          title="# Assets"
          value={isLoading ? "—" : assets.length.toString()}
          sub={isLoading ? undefined : `${Object.keys(allocationMap).length} categories`}
          icon={Percent}
          loading={isLoading}
        />
      </div>

      {/* Charts + Top Holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Allocation by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : allocationData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No assets yet
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {allocationData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-2 flex-1">
                  {allocationData.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-muted-foreground flex-1">{d.name}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">{d.pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Holdings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topHoldings.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
                <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
                <p>No holdings yet. Add your first asset.</p>
                <Link href="/holdings/new">
                  <Button size="sm" variant="outline">Add Asset</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-0 divide-y divide-border">
                {topHoldings.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: ASSET_TYPE_COLORS[a.assetType] ?? "#888" }}
                    >
                      {(a.ticker ?? a.name).slice(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.ticker ?? ASSET_TYPE_LABELS[a.assetType]}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium tabular-nums">{formatCurrency(a.value, true)}</div>
                      <div className={`text-xs font-mono ${a.gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                        {formatPct(a.gain)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Holdings Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">All Holdings</CardTitle>
            <Link href="/holdings">
              <Button variant="ghost" size="sm" className="text-xs">
                Manage →
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : assets.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No assets found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted-foreground font-medium px-5 py-2.5">Asset</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5">Type</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5">Qty</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5">Cost Price</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5">Current Price</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5">Market Value</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-5 py-2.5">Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const mv = a.quantity * a.currentPrice;
                    const cost = a.quantity * a.purchasePrice;
                    const gain = mv - cost;
                    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-asset-${a.id}`}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{a.name}</div>
                          {a.ticker && <div className="text-xs text-muted-foreground">{a.ticker}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary" className="capitalize text-xs">{ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{a.quantity.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatCurrency(a.purchasePrice)}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(a.currentPrice)}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-medium">{formatCurrency(mv)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={`font-mono tabular-nums font-medium ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {formatCurrency(gain)}
                          </div>
                          <div className={`text-xs font-mono ${gain >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {formatPct(gainPct)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
