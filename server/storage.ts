import {
  assets, transactions, portfolioSnapshots, liabilities, subscriptions,
  type Asset, type InsertAsset,
  type Transaction, type InsertTransaction,
  type PortfolioSnapshot, type InsertSnapshot,
  type Liability, type InsertLiability,
  type Subscription, type InsertSubscription,
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

  // Liabilities
  getLiabilities(): Promise<Liability[]>;
  getLiability(id: number): Promise<Liability | undefined>;
  createLiability(liability: InsertLiability): Promise<Liability>;
  updateLiability(id: number, liability: Partial<InsertLiability>): Promise<Liability>;
  deleteLiability(id: number): Promise<void>;

  // Subscriptions
  getSubscriptions(): Promise<Subscription[]>;
  getSubscription(id: number): Promise<Subscription | undefined>;
  createSubscription(sub: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, sub: Partial<InsertSubscription>): Promise<Subscription>;
  deleteSubscription(id: number): Promise<void>;

  // Transactions
  getTransactions(assetId?: number): Promise<Transaction[]>;
  createTransaction(tx: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;

  // Snapshots
  getSnapshots(limit?: number): Promise<PortfolioSnapshot[]>;
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

  // Liabilities
  async getLiabilities(): Promise<Liability[]> {
    return await this.db.select().from(liabilities);
  }

  async getLiability(id: number): Promise<Liability | undefined> {
    const [l] = await this.db.select().from(liabilities).where(eq(liabilities.id, id));
    return l;
  }

  async createLiability(insertLiability: InsertLiability): Promise<Liability> {
    const [l] = await this.db.insert(liabilities).values(insertLiability).returning();
    return l;
  }

  async updateLiability(id: number, updates: Partial<InsertLiability>): Promise<Liability> {
    const [l] = await this.db.update(liabilities).set(updates).where(eq(liabilities.id, id)).returning();
    if (!l) throw new Error("Liability not found");
    return l;
  }

  async deleteLiability(id: number): Promise<void> {
    await this.db.delete(liabilities).where(eq(liabilities.id, id));
  }

  // Subscriptions
  async getSubscriptions(): Promise<Subscription[]> {
    return await this.db.select().from(subscriptions);
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    const [s] = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return s;
  }

  async createSubscription(insertSub: InsertSubscription): Promise<Subscription> {
    const [s] = await this.db.insert(subscriptions).values(insertSub).returning();
    return s;
  }

  async updateSubscription(id: number, updates: Partial<InsertSubscription>): Promise<Subscription> {
    const [s] = await this.db.update(subscriptions).set(updates).where(eq(subscriptions.id, id)).returning();
    if (!s) throw new Error("Subscription not found");
    return s;
  }

  async deleteSubscription(id: number): Promise<void> {
    await this.db.delete(subscriptions).where(eq(subscriptions.id, id));
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
  async getSnapshots(limit?: number): Promise<PortfolioSnapshot[]> {
    if (limit) {
      return await this.db.select().from(portfolioSnapshots).orderBy(desc(portfolioSnapshots.date)).limit(limit);
    }
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
  private liabilities: Map<number, Liability> = new Map();
  private subscriptions: Map<number, Subscription> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private snapshots: Map<number, PortfolioSnapshot> = new Map();
  private assetId = 1;
  private liabilityId = 1;
  private subscriptionId = 1;
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

  async getLiabilities(): Promise<Liability[]> { return Array.from(this.liabilities.values()); }
  async getLiability(id: number): Promise<Liability | undefined> { return this.liabilities.get(id); }
  async createLiability(l: InsertLiability): Promise<Liability> {
    const liability: Liability = { ...l, id: this.liabilityId++ };
    this.liabilities.set(liability.id, liability);
    return liability;
  }
  async updateLiability(id: number, updates: Partial<InsertLiability>): Promise<Liability> {
    const existing = this.liabilities.get(id);
    if (!existing) throw new Error("Liability not found");
    const updated = { ...existing, ...updates };
    this.liabilities.set(id, updated);
    return updated;
  }
  async deleteLiability(id: number): Promise<void> { this.liabilities.delete(id); }

  async getSubscriptions(): Promise<Subscription[]> { return Array.from(this.subscriptions.values()); }
  async getSubscription(id: number): Promise<Subscription | undefined> { return this.subscriptions.get(id); }
  async createSubscription(s: InsertSubscription): Promise<Subscription> {
    const sub: Subscription = { ...s, id: this.subscriptionId++ };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }
  async updateSubscription(id: number, updates: Partial<InsertSubscription>): Promise<Subscription> {
    const existing = this.subscriptions.get(id);
    if (!existing) throw new Error("Subscription not found");
    const updated = { ...existing, ...updates };
    this.subscriptions.set(id, updated);
    return updated;
  }
  async deleteSubscription(id: number): Promise<void> { this.subscriptions.delete(id); }

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
