import { pgTable, text, serial, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Asset types: stock, crypto, property, other
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),           // e.g. "Apple Inc", "Bitcoin", "123 Main St"
  ticker: text("ticker"),                  // e.g. "AAPL", "BTC" (optional)
  assetType: text("asset_type").notNull(), // "stock" | "crypto" | "property" | "other"
  quantity: real("quantity").notNull(),
  purchasePrice: real("purchase_price").notNull(),  // cost per unit
  currentPrice: real("current_price").notNull(),    // current price per unit
  currency: text("currency").notNull().default("HKD"),
  notes: text("notes"),
  purchaseDate: text("purchase_date"),              // ISO string YYYY-MM-DD
  category: text("category"),                        // sub-category e.g. "Tech", "DeFi", "Residential"
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// Liabilities: mortgage, loans, etc.
export const liabilities = pgTable("liabilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "mortgage" | "loan" | "credit_card" | "other"
  balance: real("balance").notNull(),
  currency: text("currency").notNull().default("HKD"),
  notes: text("notes"),
});

export const insertLiabilitySchema = createInsertSchema(liabilities).omit({ id: true });
export type InsertLiability = z.infer<typeof insertLiabilitySchema>;
export type Liability = typeof liabilities.$inferSelect;

// Transactions: manual price history / transaction log
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  type: text("type").notNull(),          // "buy" | "sell" | "dividend" | "rebalance"
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  date: text("date").notNull(),
  notes: text("notes"),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Daily portfolio value snapshots — one row per day
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),          // YYYY-MM-DD
  totalValue: real("total_value").notNull(),  // sum of all assets in HKD equivalent
  totalCost:  real("total_cost").notNull(),   // sum of all purchase costs
  totalLiability: real("total_liability").notNull().default(0), // sum of all liabilities in HKD
  assetCount: integer("asset_count").notNull(),
  createdAt:  text("created_at").notNull(),   // ISO timestamp
});

export const insertSnapshotSchema = createInsertSchema(portfolioSnapshots).omit({ id: true });
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
