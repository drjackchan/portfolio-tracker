"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/api-handler.ts
var api_handler_exports = {};
__export(api_handler_exports, {
  default: () => api_handler_default
});
module.exports = __toCommonJS(api_handler_exports);
var import_express = __toESM(require("express"), 1);
var import_serverless_http = __toESM(require("serverless-http"), 1);

// server/storage.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");
var import_drizzle_orm = require("drizzle-orm");

// shared/schema.ts
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_zod = require("drizzle-zod");
var assets = (0, import_pg_core.pgTable)("assets", {
  id: (0, import_pg_core.serial)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  // e.g. "Apple Inc", "Bitcoin", "123 Main St"
  ticker: (0, import_pg_core.text)("ticker"),
  // e.g. "AAPL", "BTC" (optional)
  assetType: (0, import_pg_core.text)("asset_type").notNull(),
  // "stock" | "crypto" | "property" | "other"
  quantity: (0, import_pg_core.real)("quantity").notNull(),
  purchasePrice: (0, import_pg_core.real)("purchase_price").notNull(),
  // cost per unit
  currentPrice: (0, import_pg_core.real)("current_price").notNull(),
  // current price per unit
  currency: (0, import_pg_core.text)("currency").notNull().default("USD"),
  notes: (0, import_pg_core.text)("notes"),
  purchaseDate: (0, import_pg_core.text)("purchase_date"),
  // ISO string YYYY-MM-DD
  category: (0, import_pg_core.text)("category")
  // sub-category e.g. "Tech", "DeFi", "Residential"
});
var insertAssetSchema = (0, import_drizzle_zod.createInsertSchema)(assets).omit({ id: true });
var transactions = (0, import_pg_core.pgTable)("transactions", {
  id: (0, import_pg_core.serial)("id").primaryKey(),
  assetId: (0, import_pg_core.integer)("asset_id").notNull(),
  type: (0, import_pg_core.text)("type").notNull(),
  // "buy" | "sell" | "dividend" | "rebalance"
  quantity: (0, import_pg_core.real)("quantity").notNull(),
  price: (0, import_pg_core.real)("price").notNull(),
  date: (0, import_pg_core.text)("date").notNull(),
  notes: (0, import_pg_core.text)("notes")
});
var insertTransactionSchema = (0, import_drizzle_zod.createInsertSchema)(transactions).omit({ id: true });

// server/storage.ts
var DatabaseStorage = class {
  _db = null;
  get db() {
    if (!this._db) {
      const pool = new import_pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5e3,
        // fail fast if DB unreachable
        idleTimeoutMillis: 1e3,
        // release connection quickly in serverless
        max: 3
      });
      this._db = (0, import_node_postgres.drizzle)(pool);
    }
    return this._db;
  }
  async getAssets() {
    return this.db.select().from(assets);
  }
  async getAsset(id) {
    const rows = await this.db.select().from(assets).where((0, import_drizzle_orm.eq)(assets.id, id));
    return rows[0];
  }
  async createAsset(asset) {
    const rows = await this.db.insert(assets).values(asset).returning();
    return rows[0];
  }
  async updateAsset(id, asset) {
    const rows = await this.db.update(assets).set(asset).where((0, import_drizzle_orm.eq)(assets.id, id)).returning();
    return rows[0];
  }
  async deleteAsset(id) {
    const rows = await this.db.delete(assets).where((0, import_drizzle_orm.eq)(assets.id, id)).returning();
    return rows.length > 0;
  }
  async getTransactions(assetId) {
    if (assetId !== void 0) {
      return this.db.select().from(transactions).where((0, import_drizzle_orm.eq)(transactions.assetId, assetId));
    }
    return this.db.select().from(transactions);
  }
  async createTransaction(tx) {
    const rows = await this.db.insert(transactions).values(tx).returning();
    return rows[0];
  }
  async deleteTransaction(id) {
    const rows = await this.db.delete(transactions).where((0, import_drizzle_orm.eq)(transactions.id, id)).returning();
    return rows.length > 0;
  }
};
var MemStorage = class {
  assets = /* @__PURE__ */ new Map();
  transactions = /* @__PURE__ */ new Map();
  assetIdCounter = 1;
  txIdCounter = 1;
  constructor() {
    const sampleAssets = [
      {
        name: "Apple Inc",
        ticker: "AAPL",
        assetType: "stock",
        quantity: 50,
        purchasePrice: 150,
        currentPrice: 178.5,
        currency: "USD",
        notes: "Long-term hold",
        purchaseDate: "2023-01-15",
        category: "Technology"
      },
      {
        name: "Bitcoin",
        ticker: "BTC",
        assetType: "crypto",
        quantity: 0.5,
        purchasePrice: 28e3,
        currentPrice: 65e3,
        currency: "USD",
        notes: "Cold storage",
        purchaseDate: "2023-05-10",
        category: "Layer 1"
      },
      {
        name: "S&P 500 ETF",
        ticker: "SPY",
        assetType: "stock",
        quantity: 30,
        purchasePrice: 420,
        currentPrice: 510,
        currency: "USD",
        notes: "Index fund",
        purchaseDate: "2022-11-01",
        category: "Index"
      },
      {
        name: "Ethereum",
        ticker: "ETH",
        assetType: "crypto",
        quantity: 3,
        purchasePrice: 1600,
        currentPrice: 3400,
        currency: "USD",
        notes: "Staking rewards",
        purchaseDate: "2023-03-20",
        category: "Layer 1"
      },
      {
        name: "123 Oak Street",
        ticker: null,
        assetType: "property",
        quantity: 1,
        purchasePrice: 32e4,
        currentPrice: 375e3,
        currency: "USD",
        notes: "Primary residence",
        purchaseDate: "2021-06-15",
        category: "Residential"
      },
      {
        name: "Gold ETF",
        ticker: "GLD",
        assetType: "other",
        quantity: 20,
        purchasePrice: 170,
        currentPrice: 195,
        currency: "USD",
        notes: "Inflation hedge",
        purchaseDate: "2023-08-01",
        category: "Commodities"
      }
    ];
    for (const a of sampleAssets) {
      const id = this.assetIdCounter++;
      this.assets.set(id, {
        ...a,
        id,
        notes: a.notes ?? null,
        ticker: a.ticker ?? null,
        purchaseDate: a.purchaseDate ?? null,
        category: a.category ?? null,
        currency: a.currency ?? "USD"
      });
    }
  }
  async getAssets() {
    return Array.from(this.assets.values());
  }
  async getAsset(id) {
    return this.assets.get(id);
  }
  async createAsset(asset) {
    const id = this.assetIdCounter++;
    const newAsset = {
      ...asset,
      id,
      notes: asset.notes ?? null,
      ticker: asset.ticker ?? null,
      purchaseDate: asset.purchaseDate ?? null,
      category: asset.category ?? null,
      currency: asset.currency ?? "USD"
    };
    this.assets.set(id, newAsset);
    return newAsset;
  }
  async updateAsset(id, asset) {
    const existing = this.assets.get(id);
    if (!existing) return void 0;
    const updated = { ...existing, ...asset };
    this.assets.set(id, updated);
    return updated;
  }
  async deleteAsset(id) {
    return this.assets.delete(id);
  }
  async getTransactions(assetId) {
    const all = Array.from(this.transactions.values());
    if (assetId !== void 0) return all.filter((t) => t.assetId === assetId);
    return all;
  }
  async createTransaction(tx) {
    const id = this.txIdCounter++;
    const newTx = { ...tx, id, notes: tx.notes ?? null };
    this.transactions.set(id, newTx);
    return newTx;
  }
  async deleteTransaction(id) {
    return this.transactions.delete(id);
  }
};
var storage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();

// db/migrate.ts
var import_node_postgres2 = require("drizzle-orm/node-postgres");
var import_pg2 = require("pg");
var import_drizzle_orm2 = require("drizzle-orm");
async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  const pool = new import_pg2.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5e3,
    // fail fast if DB unreachable
    idleTimeoutMillis: 1e3,
    // don't keep function alive after done
    max: 1
  });
  const db = (0, import_node_postgres2.drizzle)(pool);
  await db.execute(import_drizzle_orm2.sql`
    CREATE TABLE IF NOT EXISTS assets (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      ticker      TEXT,
      asset_type  TEXT NOT NULL,
      quantity    REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price  REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'USD',
      notes       TEXT,
      purchase_date TEXT,
      category    TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id        SERIAL PRIMARY KEY,
      asset_id  INTEGER NOT NULL,
      type      TEXT NOT NULL,
      quantity  REAL NOT NULL,
      price     REAL NOT NULL,
      date      TEXT NOT NULL,
      notes     TEXT
    );
  `);
  await pool.end();
  console.log("[db] Tables ready");
}

// server/api-handler.ts
runMigrations().catch(
  (err) => console.warn("[db] Migration error (non-fatal):", err)
);
var app = (0, import_express.default)();
app.use(import_express.default.json());
app.use(import_express.default.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: !!process.env.DATABASE_URL ? "postgres" : "memory",
    ts: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/assets", async (req, res) => {
  const assets2 = await storage.getAssets();
  res.json(assets2);
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
app.get("/api/transactions", async (req, res) => {
  const assetId = req.query.assetId ? parseInt(req.query.assetId) : void 0;
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
app.use((err, _req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});
var handler = (0, import_serverless_http.default)(app);
var api_handler_default = handler;
module.exports = handler;
