import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { storage } from "./storage";
import { insertAssetSchema, insertTransactionSchema } from "../shared/schema";
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

// Cron-secret bypass for snapshot endpoint (before requireAuth)
app.post("/api/snapshots", (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["x-cron-secret"] === cronSecret) {
    // Skip requireAuth for valid cron requests
    return takeSnapshot()
      .then((result) => res.json(result))
      .catch((e: any) => res.status(500).json({ message: e.message }));
  }
  next(); // fall through to requireAuth
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
    const ok = await storage.deleteAsset(id);
    if (!ok) return res.status(404).json({ message: "Asset not found" });
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
    const ok = await storage.deleteTransaction(id);
    if (!ok) return res.status(404).json({ message: "Transaction not found" });
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
    else if (asset.assetType === "crypto") price = await fetchCryptoPrice(asset.ticker);

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
