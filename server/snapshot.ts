/**
 * Portfolio snapshot helpers.
 *
 * A snapshot records the total HKD-equivalent value of the portfolio
 * on a given date. One snapshot per day is taken automatically by the
 * daily cron job; it can also be triggered manually.
 *
 * USD/non-HKD assets: we use a fixed approximate rate (1 USD = 7.8 HKD)
 * so the time-series is comparable. The rate can be made dynamic later.
 */
import { storage } from "./storage";
import { fetchPrices } from "./prices";

// Approximate fixed FX rates (for consistent historical snapshots over time)
const USD_TO_HKD = 7.8;
const CNY_TO_HKD = 1.08; // 1 CNY ≈ 1.08 HKD

function toHkd(value: number, currency: string): number {
  const ccy = (currency || "HKD").toUpperCase();
  if (ccy === "USD") return value * USD_TO_HKD;
  if (ccy === "CNY") return value * CNY_TO_HKD;
  return value; // HKD and unknown currencies treated as HKD
}

/** Compute today's snapshot from live asset data and persist it */
export async function takeSnapshot(dateOverride?: string): Promise<{
  date: string;
  totalValue: number;
  totalCost: number;
  totalLiability: number;
  assetCount: number;
}> {
  const assets = await storage.getAssets();
  const liabilities = await storage.getLiabilities();
  
  if (assets.length === 0 && liabilities.length === 0) throw new Error("No assets or liabilities to snapshot");

  // Refresh prices for stocks + crypto + commodities first
  const refreshable = assets.filter(
    (a) => (a.assetType === "stock" || a.assetType === "crypto" || a.assetType === "commodity") && a.ticker
  );
  if (refreshable.length > 0) {
    const priceResults = await fetchPrices(refreshable);
    await Promise.all(
      priceResults.map(async (r) => {
        if (r.price !== null) {
          await storage.updateAsset(r.assetId, { currentPrice: r.price });
        }
      })
    );
  }

  // Re-fetch updated assets
  const updated = await storage.getAssets();

  const totalAssetsValue = updated.reduce(
    (s, a) => s + toHkd(a.quantity * a.currentPrice, a.currency), 0
  );
  const totalCost = updated.reduce(
    (s, a) => s + toHkd(a.quantity * a.purchasePrice, a.currency), 0
  );
  const totalLiability = liabilities.reduce(
    (s, l) => s + toHkd(l.balance, l.currency), 0
  );
  
  // Save totalValue as the sum of assets to maintain backward compatibility
  const totalValue = totalAssetsValue;

  const now = new Date();
  // Use HKT (UTC+8) for the date label
  const hktDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const date = dateOverride ?? hktDate.toISOString().slice(0, 10);

  await storage.saveSnapshot({
    date,
    totalValue,
    totalCost,
    totalLiability,
    assetCount: updated.length,
    createdAt: now.toISOString(),
  });

  return { date, totalValue, totalCost, totalLiability, assetCount: updated.length };
}
