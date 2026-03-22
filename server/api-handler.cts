import express, { type Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertAssetSchema, insertTransactionSchema } from "../shared/schema";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for Vercel
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.status(200).end();
  next();
});

// Diagnostic — instant response, no DB
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: (process.env.POSTGRES_URL || process.env.DATABASE_URL) ? "postgres" : "memory",
    ts: new Date().toISOString(),
  });
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

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

// Vercel Node launcher calls module.exports(req, res) directly — Express app IS a valid handler
module.exports = app;
