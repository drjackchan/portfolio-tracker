import { pgTable, text, serial, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Asset types: stock, crypto, commodity, property, cash, other
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),           // e.g. "Apple Inc", "Bitcoin", "123 Main St", "Physical Gold"
  ticker: text("ticker"),                  // e.g. "AAPL", "BTC", "GC=F" (optional; enables auto price for stock/crypto/commodity)
  assetType: text("asset_type").notNull(), // "stock" | "crypto" | "commodity" | "property" | "cash" | "other"
  quantity: real("quantity").notNull(),
  purchasePrice: real("purchase_price").notNull(),  // cost per unit
  currentPrice: real("current_price").notNull(),    // current price per unit
  currency: text("currency").notNull().default("HKD"),
  notes: text("notes"),
  purchaseDate: text("purchase_date"),              // ISO string YYYY-MM-DD
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const updateAssetSchema = insertAssetSchema.partial().extend({
  quantity: z.coerce.number().optional(),
  purchasePrice: z.coerce.number().optional(),
  currentPrice: z.coerce.number().optional(),
});
export type UpdateAsset = z.infer<typeof updateAssetSchema>;

// Liabilities: mortgage, loans, etc.
export const liabilities = pgTable("liabilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "mortgage" | "loan" | "credit_card" | "other"
  balance: real("balance").notNull(),
  interestRate: real("interest_rate").notNull().default(0), // annual percentage rate
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

// Subscriptions: Netflix, VPN, AI tools, etc.
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("HKD"),
  frequency: text("frequency").notNull().default("monthly"), // "monthly" | "yearly"
  category: text("category"), // "Entertainment", "Utility", "Software", etc.
  nextBillingDate: text("next_billing_date"), // ISO string YYYY-MM-DD
  status: text("status").notNull().default("active"), // "active" | "inactive"
  notes: text("notes"),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions, {
  amount: z.coerce.number().positive(),
  nextBillingDate: z.string().nullable().optional().or(z.literal("")),
}).omit({ id: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Watchlist: user-tracked symbols for quick price monitoring (not owned assets)
export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),           // e.g. "AAPL", "0005.HK", "BTC"
  name: text("name"),                         // optional friendly name
  assetType: text("asset_type").notNull(),    // "stock" | "crypto"
  position: integer("position").notNull().default(0),  // for custom user ordering
  createdAt: text("created_at").notNull(),    // ISO timestamp
});

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({ id: true, createdAt: true, position: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;

export const updateWatchlistSchema = insertWatchlistSchema.partial();
export type UpdateWatchlist = z.infer<typeof updateWatchlistSchema>;

export type WatchlistItem = typeof watchlist.$inferSelect;
