import express, { type Request, Response, NextFunction } from "express";
import { storage } from "../server/storage";
import { insertAssetSchema, insertTransactionSchema } from "../shared/schema";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for Vercel
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

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
  if (!result.success) return res.status(400).json({ message: "Invalid data" });
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
  if (!result.success) return res.status(400).json({ message: "Invalid data" });
  const tx = await storage.createTransaction(result.data);
  res.status(201).json(tx);
});

app.delete("/api/transactions/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const ok = await storage.deleteTransaction(id);
  if (!ok) return res.status(404).json({ message: "Transaction not found" });
  res.status(204).end();
});

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

export default app;
