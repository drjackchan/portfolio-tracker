import type { Express } from "express";
import { type Server } from "http";
import cookieParser from "cookie-parser";
import { storage } from "./storage";
import { insertAssetSchema, insertTransactionSchema, insertLiabilitySchema } from "@shared/schema";
import { z } from "zod";
import { fetchPrices, fetchStockPrice, fetchCryptoPrice } from "./prices";
import { takeSnapshot } from "./snapshot";
import { requireAuth, handleLogin, handleLogout, handleAuthCheck } from "./auth";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Cookie parser (needed for JWT cookie auth)
  app.use(cookieParser());

  // Public auth routes
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.get("/api/auth/check", handleAuthCheck);

  // Protect all other API routes
  app.use("/api", requireAuth);

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
    res.status(204).end();
  });

  // --- Liabilities ---
  app.get("/api/liabilities", async (req, res) => {
    const liabilities = await storage.getLiabilities();
    res.json(liabilities);
  });

  app.get("/api/liabilities/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const liability = await storage.getLiability(id);
    if (!liability) return res.status(404).json({ message: "Liability not found" });
    res.json(liability);
  });

  app.post("/api/liabilities", async (req, res) => {
    const result = insertLiabilitySchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const liability = await storage.createLiability(result.data);
    res.status(201).json(liability);
  });

  app.patch("/api/liabilities/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const result = insertLiabilitySchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid data", errors: result.error.errors });
    const liability = await storage.updateLiability(id, result.data);
    if (!liability) return res.status(404).json({ message: "Liability not found" });
    res.json(liability);
  });

  app.delete("/api/liabilities/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteLiability(id);
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
    await storage.deleteTransaction(id);
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
      else if (asset.assetType === "crypto") price = await fetchCryptoPrice(asset.ticker, asset.currency);
      if (price === null) return res.status(502).json({ message: `Could not fetch price for ${asset.ticker}` });
      const updated = await storage.updateAsset(id, { currentPrice: price });
      res.json({ assetId: id, ticker: asset.ticker, price, asset: updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // --- Portfolio Snapshots ---
  app.get("/api/snapshots", async (_req, res) => {
    try {
      const snaps = await storage.getSnapshots(400);
      res.json(snaps);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/snapshots", async (_req, res) => {
    try {
      const result = await takeSnapshot();
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // --- AdSense Income ---
  app.get("/api/adsense/income", async (_req, res) => {
    const clientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADSENSE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADSENSE_REFRESH_TOKEN;
    const accountId = process.env.GOOGLE_ADSENSE_ACCOUNT_ID;

    // Check if configuration exists
    if (!clientId || !clientSecret || !refreshToken || !accountId) {
      // Return dummy data and indicate it's not configured
      return res.json({
        isConfigured: false,
        data: {
          today: 14.50,
          thisMonth: 432.10,
          lastMonth: 1250.00,
          currency: "USD",
        },
      });
    }

    try {
      // In a real scenario, you would use the 'googleapis' package with OAuth2:
      // const { google } = require('googleapis');
      // const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      // oauth2Client.setCredentials({ refresh_token: refreshToken });
      // const adsense = google.adsense({ version: 'v2', auth: oauth2Client });
      // const response = await adsense.accounts.reports.generate({
      //   account: `accounts/${accountId}`,
      //   dateRange: 'TODAY', // etc
      //   metrics: ['ESTIMATED_EARNINGS']
      // });
      // const data = response.data;
      
      // For now, even if configured, we return mock success data
      res.json({
        isConfigured: true,
        data: {
          today: 25.00,
          thisMonth: 850.50,
          lastMonth: 2100.75,
          currency: "USD",
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to fetch AdSense data: " + e.message });
    }
  });

  return httpServer;
}
