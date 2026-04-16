import {
  assets, transactions, portfolioSnapshots,
  type Asset, type InsertAsset,
  type Transaction, type InsertTransaction,
  type PortfolioSnapshot, type InsertSnapshot,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, sql } from "drizzle-orm";
import { runMigrations } from "../db/migrate";

export interface IStorage {
  // Assets
  getAssets(): Promise<Asset[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;

  // Transactions
  getTransactions(assetId?: number): Promise<Transaction[]>;
  createTransaction(tx: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;

  // Snapshots
  getSnapshots(): Promise<PortfolioSnapshot[]>;
  saveSnapshot(snap: InsertSnapshot): Promise<PortfolioSnapshot>;
}

export class DatabaseStorage implements IStorage {
  private pool: Pool;
  public db: any;

  constructor() {
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL is not set");
    }

    this.pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });

    this.db = drizzle(this.pool);

    // Run migrations on start
    runMigrations().catch(err => console.error("Migration failed", err));
  }

  // --- INTERNAL HELPER ---
  // If the database is empty, we can optionally seed it here or just let the user add.
  // For this prototype, let's keep it simple. We'll add a helper to ensure tables exist.
  async ensureTables() {
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS assets (
          id            SERIAL PRIMARY KEY,
          name          TEXT NOT NULL,
          ticker        TEXT,
          asset_type    TEXT NOT NULL,
          quantity      REAL NOT NULL,
          purchase_price REAL NOT NULL,
          current_price  REAL NOT NULL,
          currency      TEXT NOT NULL DEFAULT 'HKD',
          notes         TEXT,
          purchase_date TEXT,
          category      TEXT
        );
      `);
      await this.db.execute(sql`
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
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
          id          SERIAL PRIMARY KEY,
          date        TEXT NOT NULL,
          total_value REAL NOT NULL,
          total_cost  REAL NOT NULL,
          asset_count INTEGER NOT NULL,
          created_at  TEXT NOT NULL
        );
      `);
    } catch (e) {
      console.error("ensureTables failed", e);
    }
  }

  // Assets
  async getAssets(): Promise<Asset[]> {
    return await this.db.select().from(assets);
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    const [a] = await this.db.select().from(assets).where(eq(assets.id, id));
    return a;
  }

  async createAsset(insertAsset: InsertAsset): Promise<Asset> {
    const [a] = await this.db.insert(assets).values(insertAsset).returning();
    return a;
  }

  async updateAsset(id: number, updates: Partial<InsertAsset>): Promise<Asset> {
    const [a] = await this.db.update(assets).set(updates).where(eq(assets.id, id)).returning();
    if (!a) throw new Error("Asset not found");
    return a;
  }

  async deleteAsset(id: number): Promise<void> {
    await this.db.delete(transactions).where(eq(transactions.assetId, id));
    await this.db.delete(assets).where(eq(assets.id, id));
  }

  // Transactions
  async getTransactions(assetId?: number): Promise<Transaction[]> {
    if (assetId) {
      return await this.db.select().from(transactions).where(eq(transactions.assetId, assetId)).orderBy(desc(transactions.date));
    }
    return await this.db.select().from(transactions).orderBy(desc(transactions.date));
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [res] = await this.db.insert(transactions).values(tx).returning();
    return res;
  }

  async deleteTransaction(id: number): Promise<void> {
    await this.db.delete(transactions).where(eq(transactions.id, id));
  }

  // Snapshots
  async getSnapshots(): Promise<PortfolioSnapshot[]> {
    return await this.db.select().from(portfolioSnapshots).orderBy(portfolioSnapshots.date);
  }

  async saveSnapshot(snap: InsertSnapshot): Promise<PortfolioSnapshot> {
    const [res] = await this.db.insert(portfolioSnapshots).values(snap).returning();
    return res;
  }
}

// Memory Storage for fallback / local testing
export class MemStorage implements IStorage {
  private assets: Map<number, Asset> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private snapshots: Map<number, PortfolioSnapshot> = new Map();
  private assetId = 1;
  private txId = 1;
  private snapId = 1;

  constructor() {
    // Initial mock data for quick demo
    const initialAssets: InsertAsset[] = [
      {
        name: "Apple Inc",
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 185,
        currency: "HKD",
        category: "Tech",
        notes: "Long term hold",
        purchaseDate: "2023-01-15"
      },
      {
        name: "Bitcoin",
        ticker: "BTC",
        assetType: "crypto",
        quantity: 0.5,
        purchasePrice: 25000,
        currentPrice: 42000,
        currency: "HKD",
        category: "Crypto",
        notes: "Store of value",
        purchaseDate: "2023-03-10"
      },
      {
        name: "London Flat",
        ticker: null,
        assetType: "property",
        quantity: 1,
        purchasePrice: 450000,
        currentPrice: 475000,
        currency: "HKD",
        category: "Real Estate",
        notes: "Rental property",
        purchaseDate: "2022-05-20"
      }
    ];

    initialAssets.forEach(a => this.createAsset(a));
  }

  async getAssets(): Promise<Asset[]> { return Array.from(this.assets.values()); }
  async getAsset(id: number): Promise<Asset | undefined> { return this.assets.get(id); }
  async createAsset(a: InsertAsset): Promise<Asset> {
    const asset: Asset = { ...a, id: this.assetId++ };
    this.assets.set(asset.id, asset);
    return asset;
  }
  async updateAsset(id: number, updates: Partial<InsertAsset>): Promise<Asset> {
    const existing = this.assets.get(id);
    if (!existing) throw new Error("Asset not found");
    const updated = { ...existing, ...updates };
    this.assets.set(id, updated);
    return updated;
  }
  async deleteAsset(id: number): Promise<void> { this.assets.delete(id); }

  async getTransactions(assetId?: number): Promise<Transaction[]> {
    const list = Array.from(this.transactions.values());
    if (assetId) return list.filter(t => t.assetId === assetId);
    return list;
  }
  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const res: Transaction = { ...tx, id: this.txId++ };
    this.transactions.set(res.id, res);
    return res;
  }
  async deleteTransaction(id: number): Promise<void> { this.transactions.delete(id); }

  async getSnapshots(): Promise<PortfolioSnapshot[]> { return Array.from(this.snapshots.values()); }
  async saveSnapshot(s: InsertSnapshot): Promise<PortfolioSnapshot> {
    const res: PortfolioSnapshot = { ...s, id: this.snapId++ };
    this.snapshots.set(res.id, res);
    return res;
  }
}

export const storage = new DatabaseStorage();
