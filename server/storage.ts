import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  assets,
  transactions,
  type Asset,
  type InsertAsset,
  type Transaction,
  type InsertTransaction,
} from "@shared/schema";

export interface IStorage {
  // Assets
  getAssets(): Promise<Asset[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: number): Promise<boolean>;

  // Transactions
  getTransactions(assetId?: number): Promise<Transaction[]>;
  createTransaction(tx: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number): Promise<boolean>;
}

// ─── PostgreSQL Storage ───────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;
  private tablesReady: Promise<void> | null;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 500,
      allowExitOnIdle: true,   // critical: lets Node.js exit after response
      max: 1,
    });
    this.db = drizzle(this.pool);
    // Tables are created lazily on first query (via ready())
    this.tablesReady = null;
  }

  private async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        ticker        TEXT,
        asset_type    TEXT NOT NULL,
        quantity      REAL NOT NULL,
        purchase_price REAL NOT NULL,
        current_price  REAL NOT NULL,
        currency      TEXT NOT NULL DEFAULT 'USD',
        notes         TEXT,
        purchase_date TEXT,
        category      TEXT
      );
    `);
    await this.pool.query(`
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
  }

  private async ready() {
    if (!this.tablesReady) {
      this.tablesReady = this.ensureTables().catch(() => {/* non-fatal */});
    }
    await this.tablesReady;
  }

  async end() {
    try { await this.pool.end(); } catch {}
  }

  async getAssets(): Promise<Asset[]> {
    await this.ready();
    return this.db.select().from(assets);
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    await this.ready();
    const rows = await this.db.select().from(assets).where(eq(assets.id, id));
    return rows[0];
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    await this.ready();
    const rows = await this.db.insert(assets).values(asset).returning();
    return rows[0];
  }

  async updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset | undefined> {
    await this.ready();
    const rows = await this.db
      .update(assets)
      .set(asset)
      .where(eq(assets.id, id))
      .returning();
    return rows[0];
  }

  async deleteAsset(id: number): Promise<boolean> {
    await this.ready();
    const rows = await this.db
      .delete(assets)
      .where(eq(assets.id, id))
      .returning();
    return rows.length > 0;
  }

  async getTransactions(assetId?: number): Promise<Transaction[]> {
    await this.ready();
    if (assetId !== undefined) {
      return this.db
        .select()
        .from(transactions)
        .where(eq(transactions.assetId, assetId));
    }
    return this.db.select().from(transactions);
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    await this.ready();
    const rows = await this.db.insert(transactions).values(tx).returning();
    return rows[0];
  }

  async deleteTransaction(id: number): Promise<boolean> {
    await this.ready();
    const rows = await this.db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning();
    return rows.length > 0;
  }
}

// ─── In-Memory Storage (fallback / local dev without DB) ─────────────────────

export class MemStorage implements IStorage {
  private assets: Map<number, Asset> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private assetIdCounter = 1;
  private txIdCounter = 1;

  constructor() {
    // Seed with sample data
    const sampleAssets: InsertAsset[] = [
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
        category: "Technology",
      },
      {
        name: "Bitcoin",
        ticker: "BTC",
        assetType: "crypto",
        quantity: 0.5,
        purchasePrice: 28000,
        currentPrice: 65000,
        currency: "USD",
        notes: "Cold storage",
        purchaseDate: "2023-05-10",
        category: "Layer 1",
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
        category: "Index",
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
        category: "Layer 1",
      },
      {
        name: "123 Oak Street",
        ticker: null,
        assetType: "property",
        quantity: 1,
        purchasePrice: 320000,
        currentPrice: 375000,
        currency: "USD",
        notes: "Primary residence",
        purchaseDate: "2021-06-15",
        category: "Residential",
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
        category: "Commodities",
      },
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
        currency: a.currency ?? "USD",
      });
    }
  }

  async getAssets(): Promise<Asset[]> {
    return Array.from(this.assets.values());
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    return this.assets.get(id);
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const id = this.assetIdCounter++;
    const newAsset: Asset = {
      ...asset,
      id,
      notes: asset.notes ?? null,
      ticker: asset.ticker ?? null,
      purchaseDate: asset.purchaseDate ?? null,
      category: asset.category ?? null,
      currency: asset.currency ?? "USD",
    };
    this.assets.set(id, newAsset);
    return newAsset;
  }

  async updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset | undefined> {
    const existing = this.assets.get(id);
    if (!existing) return undefined;
    const updated: Asset = { ...existing, ...asset };
    this.assets.set(id, updated);
    return updated;
  }

  async deleteAsset(id: number): Promise<boolean> {
    return this.assets.delete(id);
  }

  async getTransactions(assetId?: number): Promise<Transaction[]> {
    const all = Array.from(this.transactions.values());
    if (assetId !== undefined) return all.filter((t) => t.assetId === assetId);
    return all;
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const id = this.txIdCounter++;
    const newTx: Transaction = { ...tx, id, notes: tx.notes ?? null };
    this.transactions.set(id, newTx);
    return newTx;
  }

  async deleteTransaction(id: number): Promise<boolean> {
    return this.transactions.delete(id);
  }
}

// ─── Export the right storage based on environment ───────────────────────────
// Use a lazy proxy so DatabaseStorage (and its pg Pool) are NOT created at
// module load time. In serverless, module-level Pool construction causes a
// connection attempt that keeps the Lambda alive before any request arrives.

let _storage: IStorage | null = null;

function getStorage(): IStorage {
  if (!_storage) {
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    _storage = dbUrl ? new DatabaseStorage(dbUrl) : new MemStorage();
  }
  return _storage;
}

export const storage: IStorage = new Proxy({} as IStorage, {
  get(_target, prop: string) {
    const s = getStorage();
    const val = (s as any)[prop];
    return typeof val === "function" ? val.bind(s) : val;
  },
});
