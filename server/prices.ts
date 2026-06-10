/**
 * Price fetching for different asset classes.
 *
 * Stocks/ETFs/Commodities → Yahoo Finance public chart API (no key required)
 * Crypto                  → CoinGecko public /simple/price (no key required, 30 req/min demo limit)
 * Property/Other          → manual only, not handled here
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
  // Stablecoins — return value based on currency
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

export async function fetchCryptoPrice(ticker: string, currency = "HKD"): Promise<number | null> {
  try {
    const id = await coinGeckoIdFromSymbol(ticker);
    if (!id) return null;
    
    // For stablecoins, return 1.0 if USD, or 7.8 if HKD (approx)
    if (id === "__stable__") {
      return currency === "HKD" ? 7.8 : 1.0;
    }

    const vs = currency.toLowerCase() === "hkd" ? "hkd" : "usd";
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vs}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const price = data?.[id]?.[vs];
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
  assets: Array<{ id: number; ticker: string | null; assetType: string; currency: string }>
): Promise<PriceResult[]> {
  // We fetch each asset individually to respect its currency
  const results = await Promise.all(
    assets.map(async (asset): Promise<PriceResult> => {
      const ticker = asset.ticker?.trim() ?? "";
      if (!ticker) return { assetId: asset.id, ticker, assetType: asset.assetType, price: null, error: "No ticker" };

      let price: number | null = null;
      let error: string | undefined;

      try {
        if (asset.assetType === "stock" || asset.assetType === "commodity") {
          price = await fetchStockPrice(ticker);
          if (price === null) error = "Could not fetch price from Yahoo Finance";
        } else if (asset.assetType === "crypto") {
          price = await fetchCryptoPrice(ticker, asset.currency);
          if (price === null) error = "Could not fetch price from CoinGecko";
        } else {
          error = "Manual only";
        }
      } catch (e: any) {
        error = e.message;
      }

      return { assetId: asset.id, ticker, assetType: asset.assetType, price, error };
    })
  );

  return results;
}

// ─── Rich market data (price + % changes + sparkline) for quoted assets ───────

export type MarketData = {
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  sparkline: number[]; // oldest → newest (for last ~7d)
};

// Internal: fetch Yahoo chart data for a ticker (used by both simple price and rich data)
async function fetchYahooChart(ticker: string, interval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json() as any;
}

export async function fetchStockMarketData(ticker: string): Promise<MarketData | null> {
  try {
    // 1h resolution over 7d gives good resolution for 1h/24h/7d calcs + a nice sparkline
    const data = await fetchYahooChart(ticker, "1h", "7d");
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const timestamps: number[] = result.timestamp || [];
    const closesRaw: (number | null | undefined)[] = result.indicators?.quote?.[0]?.close || [];

    // Build clean points (skip nulls from non-trading periods)
    const points: Array<{ ts: number; close: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closesRaw[i];
      if (typeof c === "number" && isFinite(c)) {
        points.push({ ts: timestamps[i], close: c });
      }
    }
    if (points.length === 0) {
      // last resort: use meta prices we already know how to read
      const price = meta?.regularMarketPrice ?? meta?.previousClose ?? null;
      return typeof price === "number" ? { price, change1h: null, change24h: null, change7d: null, sparkline: [] } : null;
    }

    const latest = points[points.length - 1];
    const livePrice = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : latest.close;

    // Find price at (or just before) a target timestamp by walking back
    const findPriceNear = (targetTs: number): number | null => {
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].ts <= targetTs) return points[i].close;
      }
      return points[0].close;
    };

    const nowTs = latest.ts;
    const p1h = findPriceNear(nowTs - 3600);
    const p24h = findPriceNear(nowTs - 86400);
    const p7d = findPriceNear(nowTs - 86400 * 7);

    const ch1h = p1h != null ? ((livePrice - p1h) / p1h) * 100 : null;
    const ch24h = p24h != null ? ((livePrice - p24h) / p24h) * 100 : null;
    const ch7d = p7d != null ? ((livePrice - p7d) / p7d) * 100 : null;

    // Sparkline uses the available points (index based, not time-proportional — standard for sparklines)
    // Trim to a reasonable number of points for payload / render perf
    let spark = points.map((p) => p.close);
    if (spark.length > 48) {
      // simple decimation for very dense series
      const step = Math.ceil(spark.length / 36);
      spark = spark.filter((_, i) => i % step === 0 || i === spark.length - 1);
    }

    return {
      price: typeof livePrice === "number" ? livePrice : null,
      change1h: ch1h,
      change24h: ch24h,
      change7d: ch7d,
      sparkline: spark,
    };
  } catch {
    return null;
  }
}

export async function fetchCryptoMarketData(ticker: string, currency = "HKD"): Promise<MarketData | null> {
  try {
    const id = await coinGeckoIdFromSymbol(ticker);
    if (!id) return null;

    if (id === "__stable__") {
      const p = currency === "HKD" ? 7.8 : 1.0;
      return { price: p, change1h: 0, change24h: 0, change7d: 0, sparkline: [p, p, p, p, p, p, p] };
    }

    const vs = currency.toLowerCase() === "hkd" ? "hkd" : "usd";

    // % changes via markets endpoint (supports the _in_currency fields when requested)
    let price: number | null = null;
    let ch1h: number | null = null;
    let ch24h: number | null = null;
    let ch7d: number | null = null;

    try {
      const mUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${id}&price_change_percentage=1h%2C24h%2C7d`;
      const mRes = await fetch(mUrl, { signal: AbortSignal.timeout(8000) });
      if (mRes.ok) {
        const arr = (await mRes.json()) as any[];
        const it = arr?.[0];
        if (it) {
          price = typeof it.current_price === "number" ? it.current_price : null;
          ch1h = typeof it.price_change_percentage_1h_in_currency === "number" ? it.price_change_percentage_1h_in_currency : null;
          ch24h = typeof it.price_change_percentage_24h_in_currency === "number" ? it.price_change_percentage_24h_in_currency : null;
          ch7d = typeof it.price_change_percentage_7d_in_currency === "number" ? it.price_change_percentage_7d_in_currency : null;
        }
      }
    } catch {}

    // Sparkline via market_chart (more points for a pretty graph)
    let sparkline: number[] = [];
    let rawPairs: [number, number][] = [];
    try {
      const cUrl = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs}&days=7`;
      const cRes = await fetch(cUrl, { signal: AbortSignal.timeout(9000) });
      if (cRes.ok) {
        const chart = (await cRes.json()) as any;
        rawPairs = chart?.prices || [];
        sparkline = rawPairs.map(([, p]) => p).filter((p) => typeof p === "number");
        if (sparkline.length > 60) {
          // decimate a bit
          const step = Math.ceil(sparkline.length / 42);
          sparkline = sparkline.filter((_, i) => i % step === 0 || i === sparkline.length - 1);
        }
      }
    } catch {}

    if (price == null && sparkline.length) {
      price = sparkline[sparkline.length - 1];
    }

    // Fallback: derive 1h/24h/7d % from the chart time series when the /markets % call didn't give them
    // (common when rate-limited or when requesting non-USD vs_currency)
    if ((ch1h == null || ch24h == null || ch7d == null) && rawPairs.length && price != null) {
      const computed = computeChangesFromChartSeries(rawPairs, price);
      ch1h ??= computed.change1h;
      ch24h ??= computed.change24h;
      ch7d ??= computed.change7d;
    }

    if (price == null) return null;

    return { price, change1h: ch1h, change24h: ch24h, change7d: ch7d, sparkline };
  } catch {
    return null;
  }
}

function computeChangesFromChartSeries(pairs: [number, number][], latestPrice: number): { change1h: number | null; change24h: number | null; change7d: number | null } {
  if (!pairs.length || latestPrice == null) return { change1h: null, change24h: null, change7d: null };
  const latestTs = pairs[pairs.length - 1][0];
  const findP = (msAgo: number): number | null => {
    const target = latestTs - msAgo;
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (pairs[i][0] <= target) return pairs[i][1];
    }
    return null;
  };
  const p1h = findP(3600 * 1000);
  const p24h = findP(86400 * 1000);
  const p7d = findP(86400 * 1000 * 7);
  return {
    change1h: p1h != null ? ((latestPrice - p1h) / p1h) * 100 : null,
    change24h: p24h != null ? ((latestPrice - p24h) / p24h) * 100 : null,
    change7d: p7d != null ? ((latestPrice - p7d) / p7d) * 100 : null,
  };
}

export async function fetchMarketData(
  assets: Array<{ id: number; ticker: string | null; assetType: string; currency: string }>
): Promise<Array<{ assetId: number; data: MarketData | null }>> {
  const results: Array<{ assetId: number; data: MarketData | null }> = [];

  // Stocks + commodities still need per-ticker Yahoo calls (they are working fine for the user)
  const stockLike = assets.filter((a) => (a.assetType === "stock" || a.assetType === "commodity") && a.ticker);
  for (const a of stockLike) {
    const ticker = a.ticker!.trim();
    try {
      const data = await fetchStockMarketData(ticker);
      results.push({ assetId: a.id, data });
    } catch {
      results.push({ assetId: a.id, data: null });
    }
  }

  // Crypto: batch the CoinGecko /markets call by vs_currency to avoid rate limits,
  // then still fetch charts individually for sparklines (but % data is resilient).
  const cryptos = assets.filter((a) => a.assetType === "crypto" && a.ticker);

  // Group by target vs (hkd or usd) because each group needs its own markets call
  const byVs: Record<string, typeof cryptos> = {};
  for (const a of cryptos) {
    const vs = (a.currency || "HKD").toLowerCase() === "hkd" ? "hkd" : "usd";
    (byVs[vs] ||= []).push(a);
  }

  for (const [vs, group] of Object.entries(byVs)) {
    // Resolve ids (most are in the static map; search fallback is rare)
    const resolved = await Promise.all(
      group.map(async (a) => ({ a, id: await coinGeckoIdFromSymbol(a.ticker!.trim()) }))
    );

    // Batch markets for all non-stable ids in this vs group (one call instead of N)
    const marketItems: Record<string, any> = {};
    const nonStables = resolved.filter((r) => r.id && r.id !== "__stable__");
    if (nonStables.length > 0) {
      try {
        const idList = nonStables.map((r) => r.id).join(",");
        const mUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${idList}&price_change_percentage=1h%2C24h%2C7d`;
        const mRes = await fetch(mUrl, { signal: AbortSignal.timeout(10000) });
        if (mRes.ok) {
          const arr = (await mRes.json()) as any[];
          for (const it of arr) if (it?.id) marketItems[it.id] = it;
        }
      } catch {
        // will fall back to per-coin or chart series below
      }
    }

    // Per-coin work: stables are trivial; others get chart + merge with batched markets data + series fallback
    const perCoinWork = await Promise.all(
      resolved.map(async ({ a, id }) => {
        if (!id) return { assetId: a.id, data: null as MarketData | null };

        if (id === "__stable__") {
          const p = vs === "hkd" ? 7.8 : 1.0;
          return {
            assetId: a.id,
            data: { price: p, change1h: 0, change24h: 0, change7d: 0, sparkline: [p, p, p, p, p, p, p] } as MarketData,
          };
        }

        const it = marketItems[id] || {};
        let price: number | null = typeof it.current_price === "number" ? it.current_price : null;
        let ch1h: number | null = typeof it.price_change_percentage_1h_in_currency === "number" ? it.price_change_percentage_1h_in_currency : null;
        let ch24h: number | null = typeof it.price_change_percentage_24h_in_currency === "number" ? it.price_change_percentage_24h_in_currency : null;
        let ch7d: number | null = typeof it.price_change_percentage_7d_in_currency === "number" ? it.price_change_percentage_7d_in_currency : null;

        // Sparkline (and raw pairs for fallback %)
        let sparkline: number[] = [];
        let rawPairs: [number, number][] = [];
        try {
          const cUrl = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs}&days=7`;
          const cRes = await fetch(cUrl, { signal: AbortSignal.timeout(9000) });
          if (cRes.ok) {
            const chart = (await cRes.json()) as any;
            rawPairs = chart?.prices || [];
            sparkline = rawPairs.map(([, p]) => p).filter((p) => typeof p === "number");
            if (sparkline.length > 60) {
              const step = Math.ceil(sparkline.length / 42);
              sparkline = sparkline.filter((_, i) => i % step === 0 || i === sparkline.length - 1);
            }
          }
        } catch {}

        if (price == null && sparkline.length) {
          price = sparkline[sparkline.length - 1];
        }

        // Series fallback so we still get % even if the batched markets call missed this coin or rate-limited the % fields
        if ((ch1h == null || ch24h == null || ch7d == null) && rawPairs.length && price != null) {
          const computed = computeChangesFromChartSeries(rawPairs, price);
          ch1h ??= computed.change1h;
          ch24h ??= computed.change24h;
          ch7d ??= computed.change7d;
        }

        if (price == null) return { assetId: a.id, data: null as MarketData | null };
        return { assetId: a.id, data: { price, change1h: ch1h, change24h: ch24h, change7d: ch7d, sparkline } as MarketData };
      })
    );

    results.push(...perCoinWork);
  }

  return results;
}
