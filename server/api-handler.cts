import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { storage } from "./storage";
import { insertAssetSchema, insertTransactionSchema, insertLiabilitySchema, insertSubscriptionSchema } from "../shared/schema";
import { fetchPrices, fetchStockPrice, fetchCryptoPrice } from "./prices";
import { takeSnapshot } from "./snapshot";
import { requireAuth, handleLogin, handleLogout, handleAuthCheck } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Auth routes — public (no requireAuth)
app.post("/api/auth/login", handleLogin);
app.post("/api/auth/logout", handleLogout);
app.get("/api/auth/check", handleAuthCheck);

// Vercel cron job endpoint — called by Vercel's scheduler at midnight HKT.
// Vercel sends Authorization: Bearer <CRON_SECRET> automatically.
// This route is intentionally BEFORE requireAuth so Vercel can call it.
app.get("/api/cron/snapshot", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  // In production, verify Vercel's auth header if CRON_SECRET is set
  if (cronSecret) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  try {
    const result = await takeSnapshot();
    console.log(`[cron] snapshot saved: ${result.date} — $${result.totalValue.toFixed(0)}`);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron] snapshot failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Diagnostic — instant response, no DB
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: (process.env.POSTGRES_URL || process.env.DATABASE_URL) ? "postgres" : "memory",
    ts: new Date().toISOString(),
  });
});

// Protect all remaining /api/* routes
app.use("/api", requireAuth);

// --- Subscriptions ---
app.get("/api/subscriptions", async (req, res) => {
  try {
    const subs = await storage.getSubscriptions();
    res.json(subs);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/subscriptions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sub = await storage.getSubscription(id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    res.json(sub);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/subscriptions", async (req, res) => {
  try {
    const result = insertSubscriptionSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const sub = await storage.createSubscription(result.data);
    res.status(201).json(sub);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/subscriptions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertSubscriptionSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const sub = await storage.updateSubscription(id, result.data);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    res.json(sub);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/subscriptions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteSubscription(id);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// --- Assets ---
app.get("/api/assets", async (_req, res) => {
  try {
    const assets = await storage.getAssets();
    res.json(assets);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/assets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const asset = await storage.getAsset(id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.json(asset);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/assets", async (req, res) => {
  try {
    const result = insertAssetSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const asset = await storage.createAsset(result.data);
    res.status(201).json(asset);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/assets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertAssetSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data" });
    const asset = await storage.updateAsset(id, result.data);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.json(asset);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/assets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteAsset(id);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// --- Liabilities ---
app.get("/api/liabilities", async (req, res) => {
  try {
    const liabilities = await storage.getLiabilities();
    res.json(liabilities);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/liabilities/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const liability = await storage.getLiability(id);
    if (!liability) return res.status(404).json({ message: "Liability not found" });
    res.json(liability);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/liabilities", async (req, res) => {
  try {
    const result = insertLiabilitySchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const liability = await storage.createLiability(result.data);
    res.status(201).json(liability);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/liabilities/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertLiabilitySchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const liability = await storage.updateLiability(id, result.data);
    if (!liability) return res.status(404).json({ message: "Liability not found" });
    res.json(liability);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/liabilities/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteLiability(id);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// --- Transactions ---
app.get("/api/transactions", async (req, res) => {
  try {
    const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : undefined;
    const txs = await storage.getTransactions(assetId);
    res.json(txs);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const result = insertTransactionSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data" });
    const tx = await storage.createTransaction(result.data);
    res.status(201).json(tx);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteTransaction(id);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// ─── Price refresh ──────────────────────────────────────────────────────────

// Refresh prices for all assets that support auto-fetch (stocks + crypto)
app.post("/api/prices/refresh", async (_req, res) => {
  try {
    const assets = await storage.getAssets();
    const refreshable = assets.filter((a) =>
      (a.assetType === "stock" || a.assetType === "crypto") && a.ticker
    );
    const priceResults = await fetchPrices(refreshable);

    // Update prices in DB for successful fetches
    const updated: number[] = [];
    const errors: Array<{ assetId: number; ticker: string; error: string }> = [];

    await Promise.all(
      priceResults.map(async (r) => {
        if (r.price !== null) {
          await storage.updateAsset(r.assetId, { currentPrice: r.price });
          updated.push(r.assetId);
        } else if (r.error && r.error !== "Manual only" && r.error !== "No ticker") {
          errors.push({ assetId: r.assetId, ticker: r.ticker, error: r.error });
        }
      })
    );

    res.json({
      updated,
      errors,
      total: refreshable.length,
      message: `Updated ${updated.length} of ${refreshable.length} prices`,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Refresh price for a single asset
app.post("/api/prices/refresh/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const asset = await storage.getAsset(id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    if (!asset.ticker) {
      return res.status(400).json({ message: "No ticker set for this asset" });
    }
    if (asset.assetType !== "stock" && asset.assetType !== "crypto") {
      return res.status(400).json({ message: "Auto price fetch only supported for stocks and crypto" });
    }

    let price: number | null = null;
    if (asset.assetType === "stock") price = await fetchStockPrice(asset.ticker);
    else if (asset.assetType === "crypto") price = await fetchCryptoPrice(asset.ticker, asset.currency);

    if (price === null) {
      return res.status(502).json({ message: `Could not fetch price for ${asset.ticker}` });
    }

    const updated = await storage.updateAsset(id, { currentPrice: price });
    res.json({ assetId: id, ticker: asset.ticker, price, asset: updated });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// ─── Portfolio Snapshots ───────────────────────────────────────────────────

// GET /api/snapshots — return history (newest first, up to 400 rows)
app.get("/api/snapshots", async (_req, res) => {
  try {
    const snaps = await storage.getSnapshots(400);
    res.json(snaps);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/snapshots — take a snapshot right now (also used by cron)
app.post("/api/snapshots", async (_req, res) => {
  try {
    const result = await takeSnapshot();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

// Vercel Node launcher calls module.exports(req, res) directly — Express app IS a valid handler
module.exports = app;
