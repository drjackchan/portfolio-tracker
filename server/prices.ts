/**
 * Price fetching for different asset classes.
 *
 * Stocks/ETFs/Commodities → Yahoo Finance public chart API (no key required)
 * Crypto (changes + sparkline):
 *   - Preferred (if COINMARKETCAP_API_KEY set): CoinMarketCap Pro (free tier, reliable %)
 *   - Fallback: CoinGecko (public, rate-limited) + series computation fallback
 *   - Extra fallback: Yahoo (e.g. BTC-USD) via the stock path
 * Property/Other → manual only, not handled here
 *
 * Caching is used aggressively for crypto market data to stay under rate limits.
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

// Very lightweight in-memory cache to protect against CoinGecko / CMC rate limits.
// Keyed by provider-specific strings (e.g. "cg:market:bitcoin:hkd", "cmc:quotes:BTC:USD", "spark:bitcoin:hkd").
const _mdCache = new Map<string, { value: any; expiresAt: number }>();

function getCached<T>(key: string): T | undefined {
  const hit = _mdCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value as T;
  if (hit) _mdCache.delete(key);
  return undefined;
}

function setCached(key: string, value: any, ttlMs = 90_000) {
  _mdCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Optional CoinMarketCap support (recommended for reliable crypto % changes).
// Get a free key at https://coinmarketcap.com/api/ (Pro API → free plan is generous for personal use).
const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY || process.env.CMC_API_KEY;

async function fetchCryptoMarketDataFromCMC(
  tickers: string[],
  convert = "USD"
): Promise<Record<string, { price: number | null; change1h: number | null; change24h: number | null; change7d: number | null }>> {
  if (!CMC_API_KEY || tickers.length === 0) return {};
  const cacheKey = `cmc:quotes:${tickers.sort().join(",")}:${convert}`;
  const cached = getCached<Record<string, any>>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${tickers.map(t => t.toUpperCase()).join(",")}&convert=${convert}`;
    const res = await fetch(url, {
      headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as any;
    const out: Record<string, any> = {};
    const data = json?.data || {};
    for (const sym of Object.keys(data)) {
      const q = data[sym]?.quote?.[convert];
      if (q) {
        out[sym.toUpperCase()] = {
          price: typeof q.price === "number" ? q.price : null,
          change1h: typeof q.percent_change_1h === "number" ? q.percent_change_1h : null,
          change24h: typeof q.percent_change_24h === "number" ? q.percent_change_24h : null,
          change7d: typeof q.percent_change_7d === "number" ? q.percent_change_7d : null,
        };
      }
    }
    setCached(cacheKey, out, 90_000);
    return out;
  } catch {
    return {};
  }
}

export type MarketData = {
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  sparkline: number[]; // oldest → newest (for last ~7d)
  logo?: string | null; // logo image URL (CoinGecko for crypto, public cdn for stocks)
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
      logo: `https://assets.parqet.com/logos/symbol/${ticker.toUpperCase()}`,
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
      // Use a generic stablecoin logo (Tether as representative)
      const stableLogo = "https://coin-images.coingecko.com/coins/images/325/small/Tether.png";
      return { price: p, change1h: 0, change24h: 0, change7d: 0, sparkline: [p, p, p, p, p, p, p], logo: stableLogo };
    }

    const vs = currency.toLowerCase() === "hkd" ? "hkd" : "usd";
    const upperTicker = ticker.toUpperCase();

    // 1. Try CoinMarketCap first if key is configured (much more reliable for % changes)
    if (CMC_API_KEY) {
      const cmcCacheKey = `cmc:market:${upperTicker}:${vs}`;
      const cached = getCached<MarketData>(cmcCacheKey);
      if (cached) return cached;

      const cmcMap = await fetchCryptoMarketDataFromCMC([upperTicker], vs.toUpperCase());
      const cmc = cmcMap[upperTicker];
      if (cmc) {
        // Still try to get a nice sparkline from CoinGecko (cached) or compute a minimal one
        let sparkline: number[] = [];
        try {
          const chartCacheKey = `cg:spark:${id}:${vs}`;
          const cachedSpark = getCached<number[]>(chartCacheKey);
          if (cachedSpark) {
            sparkline = cachedSpark;
          } else {
            const cUrl = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs}&days=7`;
            const cRes = await fetch(cUrl, { signal: AbortSignal.timeout(8000) });
            if (cRes.ok) {
              const chart = (await cRes.json()) as any;
              const pairs: [number, number][] = chart?.prices || [];
              sparkline = pairs.map(([, p]) => p).filter((p) => typeof p === "number");
              if (sparkline.length > 60) {
                const step = Math.ceil(sparkline.length / 42);
                sparkline = sparkline.filter((_, i) => i % step === 0 || i === sparkline.length - 1);
              }
              if (sparkline.length) setCached(chartCacheKey, sparkline, 180_000); // longer cache for sparklines
            }
          }
        } catch {}

        const result: MarketData = {
          price: cmc.price,
          change1h: cmc.change1h,
          change24h: cmc.change24h,
          change7d: cmc.change7d,
          sparkline,
          logo: null, // CMC quotes path doesn't include image; client falls back or CG will provide in other paths
        };
        setCached(cmcCacheKey, result, 90_000);
        return result;
      }
    }

    // 2. CoinGecko path (with cache + series fallback)
    const cacheKey = `cg:market:${id}:${vs}`;
    const cached = getCached<MarketData>(cacheKey);
    if (cached) return cached;

    // % changes via markets endpoint
    let price: number | null = null;
    let ch1h: number | null = null;
    let ch24h: number | null = null;
    let ch7d: number | null = null;
    let logo: string | null = null;

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
          logo = typeof it.image === "string" ? it.image : null;
        }
      }
    } catch {}

    // Sparkline via market_chart (cached separately for longer)
    let sparkline: number[] = [];
    let rawPairs: [number, number][] = [];
    const sparkCacheKey = `cg:spark:${id}:${vs}`;
    const cachedSpark = getCached<number[]>(sparkCacheKey);
    if (cachedSpark) {
      sparkline = cachedSpark;
    } else {
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
          if (sparkline.length) setCached(sparkCacheKey, sparkline, 180_000);
        }
      } catch {}
    }

    if (price == null && sparkline.length) {
      price = sparkline[sparkline.length - 1];
    }

    // Fallback derive % from chart series (very useful under CG rate limits)
    if ((ch1h == null || ch24h == null || ch7d == null) && rawPairs.length && price != null) {
      const computed = computeChangesFromChartSeries(rawPairs, price);
      ch1h ??= computed.change1h;
      ch24h ??= computed.change24h;
      ch7d ??= computed.change7d;
    }

    if (price == null) return null;

    const result: MarketData = { price, change1h: ch1h, change24h: ch24h, change7d: ch7d, sparkline, logo };
    setCached(cacheKey, result, 60_000);
    return result;
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

  // Crypto: prefer CoinMarketCap (if key configured) for reliable % changes (one batched call),
  // fall back to CoinGecko (batched + cached). Always try to attach a sparkline (cached when possible).
  // As a last resort for crypto, fall back to Yahoo (e.g. BTC-USD) which the user confirmed works for stocks.
  const cryptos = assets.filter((a) => a.assetType === "crypto" && a.ticker);

  // Group by target vs (hkd or usd)
  const byVs: Record<string, typeof cryptos> = {};
  for (const a of cryptos) {
    const vs = (a.currency || "HKD").toLowerCase() === "hkd" ? "hkd" : "usd";
    (byVs[vs] ||= []).push(a);
  }

  for (const [vs, group] of Object.entries(byVs)) {
    const convert = vs.toUpperCase(); // for CMC
    const tickers = group.map((a) => a.ticker!.trim().toUpperCase());

    // --- CMC path (preferred when key is present) ---
    let cmcData: Record<string, { price: number | null; change1h: number | null; change24h: number | null; change7d: number | null }> = {};
    if (CMC_API_KEY && tickers.length > 0) {
      const cmcCacheKey = `cmc:bulk:${tickers.sort().join(",")}:${vs}`;
      const cachedCmc = getCached<typeof cmcData>(cmcCacheKey);
      if (cachedCmc) {
        cmcData = cachedCmc;
      } else {
        cmcData = await fetchCryptoMarketDataFromCMC(tickers, convert);
        if (Object.keys(cmcData).length > 0) setCached(cmcCacheKey, cmcData, 90_000);
      }
    }

    // Resolve CG ids only for coins that didn't get good CMC data (or for sparkline)
    const resolved = await Promise.all(
      group.map(async (a) => ({ a, id: await coinGeckoIdFromSymbol(a.ticker!.trim()) }))
    );

    // Batched CG markets only for coins that still need it (and for ids)
    const needCgMarkets = resolved.filter((r) => {
      const t = r.a.ticker!.trim().toUpperCase();
      const fromCmc = cmcData[t];
      return !fromCmc || fromCmc.change1h == null; // need CG if CMC didn't give changes
    });

    const cgMarketItems: Record<string, any> = {};
    if (needCgMarkets.length > 0) {
      const cgCacheKey = `cg:bulk:markets:${needCgMarkets.map(r => r.id).filter(Boolean).sort().join(",")}:${vs}`;
      const cachedCg = getCached<Record<string, any>>(cgCacheKey);
      if (cachedCg) {
        Object.assign(cgMarketItems, cachedCg);
      } else {
        const nonStables = needCgMarkets.filter((r) => r.id && r.id !== "__stable__");
        if (nonStables.length > 0) {
          try {
            const idList = nonStables.map((r) => r.id).join(",");
            const mUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${idList}&price_change_percentage=1h%2C24h%2C7d`;
            const mRes = await fetch(mUrl, { signal: AbortSignal.timeout(10000) });
            if (mRes.ok) {
              const arr = (await mRes.json()) as any[];
              for (const it of arr) if (it?.id) cgMarketItems[it.id] = it;
              setCached(cgCacheKey, cgMarketItems, 60_000);
            }
          } catch {}
        }
      }
    }

    // Per-coin assembly + sparkline (sparklines are cached individually)
    const perCoinWork = await Promise.all(
      resolved.map(async ({ a, id }) => {
        const upperT = a.ticker!.trim().toUpperCase();

        // Stablecoins
        if (id === "__stable__") {
          const p = vs === "hkd" ? 7.8 : 1.0;
          const stableLogo = "https://coin-images.coingecko.com/coins/images/325/small/Tether.png";
          return {
            assetId: a.id,
            data: { price: p, change1h: 0, change24h: 0, change7d: 0, sparkline: [p, p, p, p, p, p, p], logo: stableLogo } as MarketData,
          };
        }

        // Start with CMC if we have it
        const fromCmc = cmcData[upperT];
        let price: number | null = fromCmc?.price ?? null;
        let ch1h: number | null = fromCmc?.change1h ?? null;
        let ch24h: number | null = fromCmc?.change24h ?? null;
        let ch7d: number | null = fromCmc?.change7d ?? null;

        // Fill gaps from CG markets batch if needed
        let logo: string | null = null;
        if ((ch1h == null || price == null) && id) {
          const it = cgMarketItems[id] || {};
          if (price == null) price = typeof it.current_price === "number" ? it.current_price : null;
          if (ch1h == null) ch1h = typeof it.price_change_percentage_1h_in_currency === "number" ? it.price_change_percentage_1h_in_currency : null;
          if (ch24h == null) ch24h = typeof it.price_change_percentage_24h_in_currency === "number" ? it.price_change_percentage_24h_in_currency : null;
          if (ch7d == null) ch7d = typeof it.price_change_percentage_7d_in_currency === "number" ? it.price_change_percentage_7d_in_currency : null;
          if (typeof it.image === "string") logo = it.image;
        }

        // If we got data from CMC but no logo yet, try to backfill from the CG batch if it was fetched for other reasons (or always attempt a lightweight logo attach via known CG id)
        if (!logo && id && cgMarketItems[id]?.image) {
          logo = cgMarketItems[id].image;
        }

        // Sparkline (heavily cached; try CG chart)
        let sparkline: number[] = [];
        let rawPairs: [number, number][] = [];
        if (id) {
          const sparkCacheKey = `cg:spark:${id}:${vs}`;
          const cachedS = getCached<number[]>(sparkCacheKey);
          if (cachedS) {
            sparkline = cachedS;
          } else {
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
                if (sparkline.length) setCached(sparkCacheKey, sparkline, 180_000);
              }
            } catch {}
          }
        }

        // If we still have no price/changes, try Yahoo fallback (e.g. "BTC-USD")
        if (price == null || ch1h == null) {
          try {
            const yahooData = await fetchStockMarketData(`${upperT}-USD`);
            if (yahooData) {
              if (price == null) price = yahooData.price;
              // Use Yahoo-computed changes only if we don't have better ones
              if (ch1h == null) ch1h = yahooData.change1h;
              if (ch24h == null) ch24h = yahooData.change24h;
              if (ch7d == null) ch7d = yahooData.change7d;
              if (sparkline.length === 0 && yahooData.sparkline?.length) sparkline = yahooData.sparkline;
              if (!logo && yahooData.logo) logo = yahooData.logo;
            }
          } catch {}
        }

        if (price == null && sparkline.length) {
          price = sparkline[sparkline.length - 1];
        }

        // Final series fallback for any missing %
        if ((ch1h == null || ch24h == null || ch7d == null) && rawPairs.length && price != null) {
          const computed = computeChangesFromChartSeries(rawPairs, price);
          ch1h ??= computed.change1h;
          ch24h ??= computed.change24h;
          ch7d ??= computed.change7d;
        }

        if (price == null) return { assetId: a.id, data: null as MarketData | null };
        return { assetId: a.id, data: { price, change1h: ch1h, change24h: ch24h, change7d: ch7d, sparkline, logo } as MarketData };
      })
    );

    results.push(...perCoinWork);
  }

  return results;
}
