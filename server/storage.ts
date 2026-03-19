import { assets, transactions, type Asset, type InsertAsset, type Transaction, type InsertTransaction } from "@shared/schema";

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

export class MemStorage implements IStorage {
  private assets: Map<number, Asset> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private assetIdCounter = 1;
  private txIdCounter = 1;

  constructor() {
    // Seed with sample data for demo purposes
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
      this.assets.set(id, { ...a, id, notes: a.notes ?? null, ticker: a.ticker ?? null, purchaseDate: a.purchaseDate ?? null, category: a.category ?? null });
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

export const storage = new MemStorage();
