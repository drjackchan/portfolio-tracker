/**
 * Price fetching for different asset classes.
 *
 * Stocks/ETFs  → Yahoo Finance public chart API (no key required)
 * Crypto       → CoinGecko public /simple/price (no key required, 30 req/min demo limit)
 * Property/Other → manual only, not handled here
 */

// ─── Yahoo Finance ────────────────────────────────────────────────────────────

export async function fetchStockPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const meta = data?.chart?.result?.[0]?.meta;
    // regularMarketPrice is the real-time/latest price
    const price = meta?.regularMarketPrice ?? meta?.previousClose ?? null;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

// ─── CoinGecko — map common ticker symbols to CoinGecko IDs ─────────────────

// CoinGecko uses its own IDs, not ticker symbols. We maintain a mapping for the
// most common coins. If a user's ticker isn't in this map we fall back to a
// search-by-symbol query.
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  TRX: "tron",
  XLM: "stellar",
  BCH: "bitcoin-cash",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  TON: "the-open-network",
  PEPE: "pepe",
  FIL: "filecoin",
  ALGO: "algorand",
  VET: "vechain",
  ICP: "internet-computer",
  HBAR: "hedera-hashgraph",
  SAND: "the-sandbox",
  MANA: "decentraland",
  CRO: "crypto-com-chain",
  MKR: "maker",
  AAVE: "aave",
  COMP: "compound-governance-token",
  SNX: "havven",
  CAKE: "pancakeswap-token",
  SUSHI: "sushi",
  YFI: "yearn-finance",
  // Stablecoins — return 1 directly, no API call needed
  USDT: "__stable__",
  USDC: "__stable__",
  BUSD: "__stable__",
  DAI:  "__stable__",
};

async function coinGeckoIdFromSymbol(symbol: string): Promise<string | null> {
  // Try the static map first
  const mapped = COINGECKO_ID_MAP[symbol.toUpperCase()];
  if (mapped) return mapped === "__stable__" ? "__stable__" : mapped;

  // Fall back to CoinGecko search endpoint
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    // Find exact symbol match (case-insensitive)
    const match = (data?.coins ?? []).find(
      (c: any) => c.symbol?.toLowerCase() === symbol.toLowerCase()
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchCryptoPrice(ticker: string): Promise<number | null> {
  try {
    const id = await coinGeckoIdFromSymbol(ticker);
    if (!id) return null;
    if (id === "__stable__") return 1.0;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const price = data?.[id]?.usd;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export type PriceResult = {
  assetId: number;
  ticker: string;
  assetType: string;
  price: number | null;
  error?: string;
};

export async function fetchPrices(
  assets: Array<{ id: number; ticker: string | null; assetType: string }>
): Promise<PriceResult[]> {
  const results = await Promise.allSettled(
    assets.map(async (asset): Promise<PriceResult> => {
      const ticker = asset.ticker?.trim() ?? "";

      if (!ticker) {
        return { assetId: asset.id, ticker, assetType: asset.assetType, price: null, error: "No ticker" };
      }

      if (asset.assetType === "stock") {
        const price = await fetchStockPrice(ticker);
        return {
          assetId: asset.id, ticker, assetType: asset.assetType, price,
          error: price === null ? "Could not fetch price from Yahoo Finance" : undefined,
        };
      }

      if (asset.assetType === "crypto") {
        const price = await fetchCryptoPrice(ticker);
        return {
          assetId: asset.id, ticker, assetType: asset.assetType, price,
          error: price === null ? "Could not fetch price from CoinGecko" : undefined,
        };
      }

      // property / other — not auto-fetched
      return { assetId: asset.id, ticker, assetType: asset.assetType, price: null, error: "Manual only" };
    })
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { assetId: -1, ticker: "", assetType: "", price: null, error: "Unexpected error" }
  );
}
