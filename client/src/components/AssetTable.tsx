import React from "react";
import { Link } from "wouter";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TickerLogo } from "@/components/TickerLogo";
import { Sparkline } from "@/components/Sparkline";
import type { Asset } from "@shared/schema";
import { toHkd as toHkdLocal } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stocks", crypto: "Crypto", property: "Property", cash: "Cash", other: "Other", commodity: "Commodities",
};

export type DisplayItem =
  | { kind: "summary"; group: any } // AssetGroup shape from Holdings
  | { kind: "detail"; asset: Asset; groupTicker?: string };

interface AssetTableProps {
  /** Flat list of assets (for dashboard / simple use) or mixed summary+detail items (for full grouped Holdings page) */
  items: Asset[] | DisplayItem[];
  marketData: Record<number, any>; // MarketData with logo, change*, sparkline, price etc.

  // Sorting (controlled)
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;

  // Visibility
  showActions?: boolean;
  showBuyPrice?: boolean; // "Buy Price" / "Cost Price"

  // Grouping support (only relevant when items are DisplayItem[])
  expandedGroups?: Set<string>;
  onToggleGroup?: (ticker: string) => void;

  // Action handlers (used when showActions)
  onEdit?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;

  /** Compact mode for dashboard embedding (slightly tighter padding, no full actions) */
  compact?: boolean;
}

function formatNativeCurrency(val: number, currency: string) {
  return new Intl.NumberFormat("en-HK", { style: "currency", currency: currency || "HKD", minimumFractionDigits: 2 }).format(val);
}

function formatPct(val: number) {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function DeleteButton({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`delete-asset-${asset.id}`}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
          <AlertDialogDescription>This will permanently remove this asset and its data.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AssetTable({
  items,
  marketData,
  sortKey,
  sortDir,
  onSort,
  showActions = true,
  showBuyPrice = true,
  expandedGroups = new Set(),
  onToggleGroup,
  onEdit,
  onDelete,
  compact = false,
}: AssetTableProps) {
  const isGroupedMode = items.length > 0 && typeof (items[0] as any).kind === "string";

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const handleHeaderClick = (key: string) => {
    if (onSort) onSort(key);
  };

  // Normalize to a list we can map (either raw assets treated as details, or the display items)
  const rows = isGroupedMode
    ? (items as DisplayItem[])
    : (items as Asset[]).map((a) => ({ kind: "detail" as const, asset: a, groupTicker: `single-${a.id}` }));

  // Helper to decide if a detail row should be indented (child of a group)
  const isChildRow = (item: any) => {
    if (item.kind !== "detail") return false;
    const gt = item.groupTicker;
    return gt && !gt.startsWith("single-");
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                className={`text-left text-xs text-muted-foreground font-medium px-5 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("name")}
              >
                Asset {getSortIndicator("name")}
              </th>
              <th
                className={`text-left text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("type")}
              >
                Type {getSortIndicator("type")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("qty")}
              >
                Qty {getSortIndicator("qty")}
              </th>
              {showBuyPrice && (
                <th
                  className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                  onClick={() => handleHeaderClick("buy")}
                >
                  Buy Price {getSortIndicator("buy")}
                </th>
              )}
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("current")}
              >
                Current {getSortIndicator("current")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("1h")}
              >
                1h % {getSortIndicator("1h")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("24h")}
              >
                24h % {getSortIndicator("24h")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-2 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("7d")}
              >
                7d % {getSortIndicator("7d")}
              </th>
              <th
                className={`w-24 text-center text-xs text-muted-foreground font-medium px-1 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                title="Last 7 days price trend"
                onClick={() => handleHeaderClick("7d")}
              >
                Last 7 Days {getSortIndicator("7d")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("value")}
              >
                Value (HKD) {getSortIndicator("value")}
              </th>
              <th
                className={`text-right text-xs text-muted-foreground font-medium px-3 py-3 ${onSort ? "cursor-pointer hover:text-foreground" : ""}`}
                onClick={() => handleHeaderClick("return")}
              >
                Return {getSortIndicator("return")}
              </th>
              {showActions && <th className="text-right text-xs text-muted-foreground font-medium px-5 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => {
              if (item.kind === "summary") {
                const g = item.group;
                const isExpanded = expandedGroups?.has(g.ticker) ?? false;
                const mv = g.totalValue;
                const gain = g.totalGain;
                const gainPct = g.gainPct;
                const md = g.md;

                return (
                  <tr
                    key={`group-${g.ticker}`}
                    className="border-b border-border/50 bg-muted/10 hover:bg-muted/30 transition-colors border-l-2 border-l-[hsl(var(--positive)/0.65)]"
                    data-testid={`group-${g.ticker}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <TickerLogo
                          ticker={g.ticker}
                          assetType={g.representative.assetType}
                          logoUrl={md?.logo}
                          size={28}
                        />
                        <div>
                          <div className="font-medium text-foreground leading-tight">{g.ticker}</div>
                          <div className="text-xs text-muted-foreground">{g.assets.length} accounts</div>
                        </div>
                        <button
                          onClick={() => onToggleGroup?.(g.ticker)}
                          className="ml-1 p-0.5 text-base leading-none rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? "Collapse group" : "Expand group"}
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {ASSET_TYPE_LABELS[g.representative.assetType] ?? g.representative.assetType}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{g.totalQty.toLocaleString()}</td>
                    {showBuyPrice && (
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">—</td>
                    )}
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono tabular-nums">
                          {formatNativeCurrency(md?.price ?? g.representative.currentPrice, g.representative.currency)}
                        </span>
                      </div>
                    </td>
                    {/* 1h % */}
                    <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                      {md?.change1h != null ? (
                        <span className={md.change1h >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                          {md.change1h >= 0 ? "▲" : "▼"}{md.change1h.toFixed(2)}%
                        </span>
                      ) : "—"}
                    </td>
                    {/* 24h % */}
                    <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                      {md?.change24h != null ? (
                        <span className={md.change24h >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                          {md.change24h >= 0 ? "▲" : "▼"}{md.change24h.toFixed(2)}%
                        </span>
                      ) : "—"}
                    </td>
                    {/* 7d % */}
                    <td className="px-2 py-3 text-right font-mono tabular-nums text-xs font-medium">
                      {md?.change7d != null ? (
                        <span className={md.change7d >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                          {md.change7d >= 0 ? "▲" : "▼"}{md.change7d.toFixed(2)}%
                        </span>
                      ) : "—"}
                    </td>
                    {/* 7d sparkline */}
                    <td className="px-1 py-3">
                      {md?.sparkline?.length ? (
                        <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} />
                      ) : <span className="text-muted-foreground/60 text-[10px]">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                      {new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(mv)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className={`font-mono tabular-nums text-xs font-medium ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                        {gain >= 0 ? "+" : ""}{new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(gain)}
                      </div>
                      <div className={`text-xs font-mono ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>{formatPct(gainPct)}</div>
                    </td>
                    {showActions && (
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => onToggleGroup?.(g.ticker)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          {isExpanded ? "Collapse" : "Expand"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              }

              // detail / flat asset row
              const a = (item as any).asset ?? item; // support both {kind:'detail', asset} and raw Asset
              const mv = toHkdLocal(a.quantity * a.currentPrice, a.currency);
              const cost = toHkdLocal(a.quantity * a.purchasePrice, a.currency);
              const gain = mv - cost;
              const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

              const isInGroup = isChildRow(item);
              const md = marketData[a.id];
              const isAuto = (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && !!a.ticker;

              return (
                <tr
                  key={(a as Asset).id ?? index}
                  className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${isInGroup ? "bg-muted/5" : ""}`}
                  data-testid={`holding-row-${(a as Asset).id}`}
                >
                  <td className="px-5 py-3">
                    <div className={`flex items-center gap-2.5 ${isInGroup ? "pl-3" : ""}`}>
                      <TickerLogo
                        ticker={(a as Asset).ticker}
                        name={(a as Asset).name}
                        assetType={(a as Asset).assetType}
                        logoUrl={md?.logo}
                        size={compact ? 24 : 28}
                      />
                      <div>
                        <div className="font-medium text-foreground leading-tight">{(a as Asset).name}</div>
                        {(a as Asset).ticker && <div className="text-xs text-muted-foreground">{(a as Asset).ticker}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {ASSET_TYPE_LABELS[(a as Asset).assetType] ?? (a as Asset).assetType}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{(a as Asset).quantity.toLocaleString()}</td>
                  {showBuyPrice && (
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatNativeCurrency((a as Asset).purchasePrice, (a as Asset).currency)}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-mono tabular-nums">
                        {formatNativeCurrency((isAuto && md?.price != null ? md.price : (a as Asset).currentPrice), (a as Asset).currency)}
                      </span>
                    </div>
                  </td>
                  {/* 1h % */}
                  <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                    {isAuto && md?.change1h != null ? (
                      <span className={md.change1h >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                        {md.change1h >= 0 ? "▲" : "▼"}{md.change1h.toFixed(2)}%
                      </span>
                    ) : isAuto ? "—" : null}
                  </td>
                  {/* 24h % */}
                  <td className="px-2 py-3 text-right font-mono tabular-nums text-xs">
                    {isAuto && md?.change24h != null ? (
                      <span className={md.change24h >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                        {md.change24h >= 0 ? "▲" : "▼"}{md.change24h.toFixed(2)}%
                      </span>
                    ) : isAuto ? "—" : null}
                  </td>
                  {/* 7d % */}
                  <td className="px-2 py-3 text-right font-mono tabular-nums text-xs font-medium">
                    {isAuto && md?.change7d != null ? (
                      <span className={md.change7d >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}>
                        {md.change7d >= 0 ? "▲" : "▼"}{md.change7d.toFixed(2)}%
                      </span>
                    ) : isAuto ? "—" : null}
                  </td>
                  {/* 7d sparkline */}
                  <td className="px-1 py-3">
                    {isAuto && md?.sparkline?.length ? (
                      <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} />
                    ) : isAuto ? <span className="text-muted-foreground/60 text-[10px]">—</span> : null}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                    {new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(mv)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-mono tabular-nums text-xs font-medium ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                      {gain >= 0 ? "+" : ""}{new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(gain)}
                    </div>
                    <div className={`text-xs font-mono ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>{formatPct(gainPct)}</div>
                  </td>
                  {showActions && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/holdings/${(a as Asset).id}/edit`}>
                          <Button size="icon" variant="ghost" data-testid={`edit-asset-${(a as Asset).id}`} onClick={() => onEdit?.(a as Asset)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <DeleteButton asset={a as Asset} onDelete={() => onDelete?.(a as Asset)} />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-border">
        {rows.map((item, index) => {
          if (item.kind === "summary") {
            const g = item.group;
            const isExpanded = expandedGroups?.has(g.ticker) ?? false;
            const mv = g.totalValue;
            const gain = g.totalGain;
            const gainPct = g.gainPct;
            const md = g.md;

            return (
              <div key={`group-mobile-${g.ticker}`} className="px-4 py-3 bg-muted/10" data-testid={`group-${g.ticker}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <TickerLogo
                      ticker={g.ticker}
                      assetType={g.representative.assetType}
                      logoUrl={md?.logo}
                      size={32}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{g.ticker}</div>
                      <div className="text-xs text-muted-foreground">{g.assets.length} accounts</div>
                    </div>
                    <button
                      onClick={() => onToggleGroup?.(g.ticker)}
                      className="p-1 text-base leading-none rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? "−" : "+"}
                    </button>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-sm font-mono font-semibold">
                      {new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(mv)}
                    </div>
                    <div className={`text-xs font-mono ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                      {formatPct(gainPct)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="capitalize text-xs">
                    {ASSET_TYPE_LABELS[g.representative.assetType] ?? g.representative.assetType}
                  </Badge>
                  <span className="text-muted-foreground">Total Qty: {g.totalQty.toLocaleString()}</span>
                  <button
                    onClick={() => onToggleGroup?.(g.ticker)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>

                {md && (
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>1h % <span className={md.change1h != null && md.change1h >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change1h != null ? `${md.change1h >= 0 ? "+" : ""}${md.change1h.toFixed(1)}` : "—"}</span></span>
                    <span>24h % <span className={md.change24h != null && md.change24h >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change24h != null ? `${md.change24h >= 0 ? "+" : ""}${md.change24h.toFixed(1)}` : "—"}</span></span>
                    <span>7d % <span className={md.change7d != null && md.change7d >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change7d != null ? `${md.change7d >= 0 ? "+" : ""}${md.change7d.toFixed(1)}` : "—"}</span></span>
                    <span className="ml-auto -mr-0.5">
                      {md.sparkline?.length ? <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} width={46} height={15} /> : null}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          // mobile detail / flat asset
          const a = (item as any).asset ?? item;
          const mv = toHkdLocal(a.quantity * a.currentPrice, a.currency);
          const cost = toHkdLocal(a.quantity * a.purchasePrice, a.currency);
          const gain = mv - cost;
          const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
          const md = marketData[a.id];
          const isAuto = (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && !!a.ticker;

          return (
            <div key={`mobile-${a.id ?? index}`} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TickerLogo
                    ticker={a.ticker}
                    name={a.name}
                    assetType={a.assetType}
                    logoUrl={md?.logo}
                    size={32}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground text-sm truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.ticker ?? ASSET_TYPE_LABELS[a.assetType]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {showActions && onEdit && (
                    <Link href={`/holdings/${a.id}/edit`}>
                      <Button size="icon" variant="ghost" data-testid={`edit-asset-${a.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                    </Link>
                  )}
                  {showActions && onDelete && <DeleteButton asset={a} onDelete={() => onDelete(a)} />}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1">
                <div>
                  <div className="text-xs text-muted-foreground">Value</div>
                  <div className="text-sm font-mono font-semibold tabular-nums">
                    {new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(mv)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Return</div>
                  <div className={`text-sm font-mono font-medium tabular-nums ${gain >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive"}`}>
                    {formatPct(gainPct)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current</div>
                  <div className="text-sm font-mono tabular-nums">
                    {formatNativeCurrency((isAuto && md?.price != null ? md.price : a.currentPrice), a.currency)}
                  </div>
                </div>
              </div>

              {isAuto && md && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>1h % <span className={md.change1h != null && md.change1h >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change1h != null ? `${md.change1h >= 0 ? "+" : ""}${md.change1h.toFixed(1)}` : "—"}</span></span>
                  <span>24h % <span className={md.change24h != null && md.change24h >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change24h != null ? `${md.change24h >= 0 ? "+" : ""}${md.change24h.toFixed(1)}` : "—"}</span></span>
                  <span>7d % <span className={md.change7d != null && md.change7d >= 0 ? "text-[hsl(var(--positive))] font-medium" : "text-destructive font-medium"}>{md.change7d != null ? `${md.change7d >= 0 ? "+" : ""}${md.change7d.toFixed(1)}` : "—"}</span></span>
                  <span className="ml-auto -mr-0.5">
                    {md.sparkline?.length ? <Sparkline data={md.sparkline} positive={(md.change7d ?? 0) >= 0} width={46} height={15} /> : null}
                  </span>
                </div>
              )}

              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="secondary" className="capitalize text-xs">{ASSET_TYPE_LABELS[a.assetType] ?? a.assetType}</Badge>
                <span className="ml-auto text-xs text-muted-foreground font-mono">Qty: {a.quantity.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Local helpers (duplicated from Holdings for self-contained component)
