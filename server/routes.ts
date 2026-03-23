import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertAssetSchema, insertTransactionSchema } from "@shared/schema";
import { z } from "zod";
import { fetchPrices, fetchStockPrice, fetchCryptoPrice } from "./prices";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // --- Assets ---
  app.get("/api/assets", async (req, res) => {
    const assets = await storage.getAssets();
    res.json(assets);
  });

  app.get("/api/assets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const asset = await storage.getAsset(id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.json(asset);
  });

  app.post("/api/assets", async (req, res) => {
    const result = insertAssetSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const asset = await storage.createAsset(result.data);
    res.status(201).json(asset);
  });

  app.patch("/api/assets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const result = insertAssetSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const asset = await storage.updateAsset(id, result.data);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.json(asset);
  });

  app.delete("/api/assets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteAsset(id);
    if (!ok) return res.status(404).json({ message: "Asset not found" });
    res.status(204).end();
  });

  // --- Transactions ---
  app.get("/api/transactions", async (req, res) => {
    const assetId = req.query.assetId ? parseInt(req.query.assetId as string) : undefined;
    const txs = await storage.getTransactions(assetId);
    res.json(txs);
  });

  app.post("/api/transactions", async (req, res) => {
    const result = insertTransactionSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const tx = await storage.createTransaction(result.data);
    res.status(201).json(tx);
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteTransaction(id);
    if (!ok) return res.status(404).json({ message: "Transaction not found" });
    res.status(204).end();
  });

  // --- Price refresh ---
  app.post("/api/prices/refresh", async (_req, res) => {
    try {
      const assets = await storage.getAssets();
      const refreshable = assets.filter((a) =>
        (a.assetType === "stock" || a.assetType === "crypto") && a.ticker
      );
      const priceResults = await fetchPrices(refreshable);
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
      res.json({ updated, errors, total: refreshable.length, message: `Updated ${updated.length} of ${refreshable.length} prices` });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/prices/refresh/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const asset = await storage.getAsset(id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      if (!asset.ticker) return res.status(400).json({ message: "No ticker set" });
      if (asset.assetType !== "stock" && asset.assetType !== "crypto") {
        return res.status(400).json({ message: "Auto price fetch only for stocks and crypto" });
      }
      let price: number | null = null;
      if (asset.assetType === "stock") price = await fetchStockPrice(asset.ticker);
      else if (asset.assetType === "crypto") price = await fetchCryptoPrice(asset.ticker);
      if (price === null) return res.status(502).json({ message: `Could not fetch price for ${asset.ticker}` });
      const updated = await storage.updateAsset(id, { currentPrice: price });
      res.json({ assetId: id, ticker: asset.ticker, price, asset: updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
