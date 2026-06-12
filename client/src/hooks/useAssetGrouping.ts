import { useState, useMemo } from "react";
import type { Asset } from "@shared/schema";
import type { DisplayItem } from "@/components/AssetTable";

type AssetGroup = {
  ticker: string;
  assets: Asset[];
  totalQty: number;
  totalValue: number; // in HKD
  totalCost: number; // in HKD
  totalGain: number; // in HKD
  gainPct: number;
  md?: any;
  representative: Asset;
};

const USD_RATE = 7.8;
const toHkd = (v: number, ccy: string) => (ccy === "USD" ? v * USD_RATE : v);

export function useAssetGrouping(
  assets: Asset[],
  marketData: Record<number, any>,
  sortKey: string,
  sortDir: "asc" | "desc"
) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const displayItems = useMemo<DisplayItem[]>(() => {
    // Group by ticker (only assets with the same non-empty ticker are grouped)
    const groupMap = new Map<string, Asset[]>();
    const singleAssets: Asset[] = [];

    for (const a of assets) {
      const t = a.ticker?.trim();
      if (t) {
        if (!groupMap.has(t)) groupMap.set(t, []);
        groupMap.get(t)!.push(a);
      } else {
        singleAssets.push(a);
      }
    }

    const groups: AssetGroup[] = [];

    // Multi-asset groups
    for (const [ticker, assetsInGroup] of groupMap.entries()) {
      const totalQty = assetsInGroup.reduce((s, a) => s + a.quantity, 0);
      const totalValue = assetsInGroup.reduce(
        (s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency),
        0
      );
      const totalCost = assetsInGroup.reduce(
        (s, a) => s + toHkd(a.quantity * a.purchasePrice, a.currency),
        0
      );
      const totalGain = totalValue - totalCost;
      const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
      const md = marketData[assetsInGroup[0].id];
      const representative = assetsInGroup[0];

      groups.push({
        ticker,
        assets: assetsInGroup,
        totalQty,
        totalValue,
        totalCost,
        totalGain,
        gainPct,
        md,
        representative,
      });
    }

    // Single (no ticker or unique)
    for (const a of singleAssets) {
      const value = toHkd(a.quantity * a.currentPrice, a.currency);
      const cost = toHkd(a.quantity * a.purchasePrice, a.currency);
      const gain = value - cost;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
      const md = marketData[a.id];
      groups.push({
        ticker: `single-${a.id}`,
        assets: [a],
        totalQty: a.quantity,
        totalValue: value,
        totalCost: cost,
        totalGain: gain,
        gainPct,
        md,
        representative: a,
      });
    }

    // Sort groups according to current sortKey / sortDir (group-level aggregates)
    groups.sort((ga, gb) => {
      let va: number | string;
      let vb: number | string;

      const mda = ga.md;
      const mdb = gb.md;

      switch (sortKey) {
        case "name":
          va = ga.representative.name.toLowerCase();
          vb = gb.representative.name.toLowerCase();
          break;
        case "type":
          va = ga.representative.assetType;
          vb = gb.representative.assetType;
          break;
        case "category":
          va = (ga.representative.category || "").toLowerCase();
          vb = (gb.representative.category || "").toLowerCase();
          break;
        case "qty":
          va = ga.totalQty;
          vb = gb.totalQty;
          break;
        case "buy":
          va = ga.representative.purchasePrice;
          vb = gb.representative.purchasePrice;
          break;
        case "current":
          va = mda?.price ?? ga.representative.currentPrice;
          vb = mdb?.price ?? gb.representative.currentPrice;
          break;
        case "1h":
          va = mda?.change1h ?? -Infinity;
          vb = mdb?.change1h ?? -Infinity;
          break;
        case "24h":
          va = mda?.change24h ?? -Infinity;
          vb = mdb?.change24h ?? -Infinity;
          break;
        case "7d":
          va = mda?.change7d ?? -Infinity;
          vb = mdb?.change7d ?? -Infinity;
          break;
        case "value":
          va = ga.totalValue;
          vb = gb.totalValue;
          break;
        case "return":
          va = ga.gainPct;
          vb = gb.gainPct;
          break;
        default:
          va = 0;
          vb = 0;
      }

      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb);
        return sortDir === "asc" ? cmp : -cmp;
      }

      const na = va as number;
      const nb = vb as number;
      if (isNaN(na) && isNaN(nb)) return 0;
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      if (na < nb) return sortDir === "asc" ? -1 : 1;
      if (na > nb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    // Build display rows
    const displayItems: DisplayItem[] = [];

    for (const group of groups) {
      const isMulti = group.assets.length > 1;
      const isExpanded = isMulti && expandedGroups.has(group.ticker);

      if (isMulti) {
        displayItems.push({ kind: "summary", group });
        if (isExpanded) {
          for (const asset of group.assets) {
            displayItems.push({ kind: "detail", asset, groupTicker: group.ticker });
          }
        }
      } else {
        const lone = group.assets[0];
        const gTicker = group.ticker.startsWith("single-")
          ? group.ticker
          : `single-${lone.id}`;
        displayItems.push({ kind: "detail", asset: lone, groupTicker: gTicker });
      }
    }

    return displayItems;
  }, [assets, marketData, sortKey, sortDir, expandedGroups]);

  const toggleGroup = (ticker: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  return {
    displayItems,
    expandedGroups,
    toggleGroup,
  };
}
