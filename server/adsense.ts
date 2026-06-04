import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

/**
 * Shared AdSense + YouTube revenue fetching logic.
 * Used by both the local dev server (routes.ts) and the Vercel serverless handler (api-handler.cts)
 * to avoid duplication.
 *
 * Env vars (all optional, but at least one source must be configured):
 *   GOOGLE_ADSENSE_CLIENT_ID, GOOGLE_ADSENSE_CLIENT_SECRET, GOOGLE_ADSENSE_REFRESH_TOKEN, GOOGLE_ADSENSE_ACCOUNT_ID
 *   GOOGLE_YOUTUBE_CHANNEL_ID (re-uses the same refresh token; set to "MINE" or "UCxxxx...")
 *
 * The refresh token must have been generated with the appropriate scopes:
 *   https://www.googleapis.com/auth/adsense.readonly
 *   https://www.googleapis.com/auth/yt-analytics-monetary.readonly   (for YouTube revenue)
 */

interface SourceData {
  today: number;
  thisMonth: number;
  lastMonth: number;
  currency: string;
}

interface RevenueResponse {
  isConfigured: boolean;
  adsense: SourceData | null;
  youtube: SourceData | null;
  errors?: string[];
}

function getReportDates() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const today = fmt(now);
  const thisMonthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = fmt(new Date(now.getFullYear(), now.getMonth(), 0));

  return {
    today: { start: today, end: today },
    thisMonth: { start: thisMonthStart, end: today },
    lastMonth: { start: lastMonthStart, end: lastMonthEnd },
  };
}

async function getAdSenseReport(
  oauth2Client: OAuth2Client,
  accountId: string,
  dateRangeOrDates: "TODAY" | "MONTH_TO_DATE" | { start: string; end: string }
): Promise<number> {
  const fullAccountId = accountId.startsWith("accounts/")
    ? accountId
    : `accounts/${accountId}`;
  let url = `https://adsense.googleapis.com/v2/${fullAccountId}/reports:generate?metrics=ESTIMATED_EARNINGS&currencyCode=HKD`;
  if (typeof dateRangeOrDates === "string") {
    url += `&dateRange=${dateRangeOrDates}`;
  } else {
    // For CUSTOM, startDate/endDate must be passed as google.type.Date fields
    // because they are message types, not primitive strings.
    // See: https://developers.google.com/adsense/management/reporting/date_ranges
    const [sy, sm, sd] = dateRangeOrDates.start.split("-").map(Number);
    const [ey, em, ed] = dateRangeOrDates.end.split("-").map(Number);
    url += `&dateRange=CUSTOM&startDate.year=${sy}&startDate.month=${sm}&startDate.day=${sd}&endDate.year=${ey}&endDate.month=${em}&endDate.day=${ed}`;
  }
  const response = await oauth2Client.request({ url });
  const data = response.data as any;
  return parseFloat(data.totals?.cells?.[0]?.value || "0");
}

async function getYouTubeReport(
  oauth2Client: OAuth2Client,
  channelId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  // Allow user to specify full ids= value, or just the ID.
  // Supports:
  //   MINE
  //   UCxxxxxxxxxxxx (channel)
  //   contentOwner==xxxxxxxx (for YouTube Partner / content owner accounts)
  //   channel==UCxxxxxxxxxxxx
  let ids = channelId;
  if (!ids.includes("==")) {
    const upper = ids.toUpperCase();
    if (upper === "MINE" || upper.startsWith("UC")) {
      ids = `channel==${ids}`;
    } else {
      ids = `contentOwner==${ids}`;
    }
  }
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=${encodeURIComponent(
    ids
  )}&startDate=${startDate}&endDate=${endDate}&metrics=estimatedRevenue&currency=HKD`;
  console.log(`[adsense] Calling YouTube Analytics with ids=${ids} (currency HKD)`);
  const response = await oauth2Client.request({ url });
  const data = response.data as any;
  if (data.rows && data.rows.length > 0) {
    // Single metric, no extra dimensions => first (only) value in the row
    return parseFloat(data.rows[0][0] || "0");
  }
  // Debug when no data
  console.log(`[adsense] YouTube API returned no rows for ids=${ids} (${startDate} to ${endDate}). Response keys:`, Object.keys(data || {}));
  if (data && data.columnHeaders) {
    console.log(`[adsense] YouTube headers:`, data.columnHeaders.map((h: any) => h.name));
  }
  return 0;
}

async function listUserChannels(oauth2Client: OAuth2Client): Promise<string[]> {
  try {
    // Requires youtube.readonly scope on the token.
    // If missing, this will fail and we fall back to MINE.
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50`;
    const response = await oauth2Client.request({ url });
    const data = response.data as any;
    const ids = (data.items || []).map((item: any) => item.id).filter(Boolean);
    console.log(`[adsense] Discovered ${ids.length} YouTube channel(s) via Data API: ${ids.join(', ')}`);
    return ids;
  } catch (e: any) {
    console.warn("[adsense] Could not list channels (probably missing youtube.readonly scope on token). Falling back to MINE.", e.response?.data || e.message);
    return [];
  }
}

async function listContentOwners(oauth2Client: OAuth2Client): Promise<string[]> {
  try {
    // Requires yt-analytics.readonly or monetary scope.
    const url = `https://www.googleapis.com/youtube/analytics/v2/contentOwners`;
    const response = await oauth2Client.request({ url });
    const data = response.data as any;
    const ids = (data.items || []).map((item: any) => item.id).filter(Boolean);
    console.log(`[adsense] Discovered ${ids.length} YouTube content owner(s): ${ids.join(', ')}`);
    return ids;
  } catch (e: any) {
    console.warn("[adsense] Could not list content owners.", e.response?.data || e.message);
    return [];
  }
}

function formatGoogleError(e: any): string {
  const status = e?.response?.status || e?.status;
  const msg = e?.response?.data?.error?.message || e?.message || String(e);
  let hint = "";

  if (msg.includes("invalid_grant") || msg.toLowerCase().includes("expired or revoked")) {
    hint = " (Refresh token invalid/revoked — re-authorize via OAuth Playground with the required scopes and get a fresh refresh_token.)";
  } else if (msg.includes("invalid_client")) {
    hint = " (invalid_client — the CLIENT_ID / CLIENT_SECRET do not match the ones used to obtain the REFRESH_TOKEN. Make sure you use the exact Client ID/Secret from the OAuth client when getting the refresh token in the Playground.)";
  } else if (status === 403 || msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("permission") || msg.includes("accessNotConfigured") || msg.includes("forbidden")) {
    hint = " (403 Permission denied on YouTube Analytics reports. This usually means the refresh token does not have access to the specified channel (common with Brand Accounts or separate Google accounts). Re-authorize in OAuth Playground with the yt-analytics-monetary.readonly scope while signed into the correct account for that channel. Make sure YouTube Analytics API is enabled in your GCP project.)";
  } else if (msg.includes("account")) {
    hint = " (Check that GOOGLE_ADSENSE_ACCOUNT_ID or the YouTube channel ID is correct for your account.)";
  }
  return msg + hint;
}

async function fetchRevenue(): Promise<RevenueResponse> {
  // AdSense credentials (can be completely separate Google account)
  const adsClientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;
  const adsClientSecret = process.env.GOOGLE_ADSENSE_CLIENT_SECRET;
  const adsRefreshToken = process.env.GOOGLE_ADSENSE_REFRESH_TOKEN;
  const accountId = process.env.GOOGLE_ADSENSE_ACCOUNT_ID;

  // YouTube credentials (can be completely separate Google account)
  const ytClientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
  const ytClientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET;
  const ytRefreshToken = process.env.GOOGLE_YOUTUBE_REFRESH_TOKEN;
  const ytChannelConfig = process.env.GOOGLE_YOUTUBE_CHANNEL_ID || "AUTO";

  const hasAdSenseCreds = !!(adsClientId && adsClientSecret && adsRefreshToken && accountId);
  const hasYT = !!ytRefreshToken;

  if (!hasAdSenseCreds && !hasYT) {
    return { isConfigured: false, adsense: null, youtube: null };
  }

  let adsenseClient = null;
  if (hasAdSenseCreds) {
    adsenseClient = new OAuth2Client(adsClientId, adsClientSecret);
    adsenseClient.setCredentials({ refresh_token: adsRefreshToken });
  }

  let youtubeClient = null;
  if (hasYT) {
    youtubeClient = new OAuth2Client(ytClientId || "not-used", ytClientSecret || "not-used");
    youtubeClient.setCredentials({ refresh_token: ytRefreshToken });
  }

  const dates = getReportDates();
  let adsense: SourceData | null = null;
  let youtube: SourceData | null = null;
  const errors: string[] = [];

  if (hasAdSenseCreds && adsenseClient) {
    try {
      const [today, thisMonth, lastMonth] = await Promise.all([
        getAdSenseReport(adsenseClient, accountId!, "TODAY"),
        getAdSenseReport(adsenseClient, accountId!, "MONTH_TO_DATE"),
        getAdSenseReport(adsenseClient, accountId!, dates.lastMonth),
      ]);
      adsense = { today, thisMonth, lastMonth, currency: "HKD" };
    } catch (e: any) {
      const friendly = formatGoogleError(e);
      errors.push(`AdSense: ${friendly}`);
      console.error("[adsense] AdSense fetch error:", e.response?.data || e.message);
    }
  }

  if (hasYT && youtubeClient) {
    try {
      let channelIdsToFetch: string[] = [];

      if (ytChannelConfig.toUpperCase() === "AUTO") {
        const discoveredChannels = await listUserChannels(youtubeClient);
        const discoveredOwners = await listContentOwners(youtubeClient);
        channelIdsToFetch = Array.from(new Set([...discoveredChannels, ...discoveredOwners]));
        if (channelIdsToFetch.length === 0) {
          channelIdsToFetch = ["MINE"];
        }
      } else {
        channelIdsToFetch = [ytChannelConfig];
      }

      let totalToday = 0;
      let totalThisMonth = 0;
      let totalLastMonth = 0;

      for (const ch of channelIdsToFetch) {
        const [t, tm, lm] = await Promise.all([
          getYouTubeReport(youtubeClient, ch, dates.today.start, dates.today.end),
          getYouTubeReport(youtubeClient, ch, dates.thisMonth.start, dates.thisMonth.end),
          getYouTubeReport(youtubeClient, ch, dates.lastMonth.start, dates.lastMonth.end),
        ]);
        totalToday += t;
        totalThisMonth += tm;
        totalLastMonth += lm;
      }

      youtube = { today: totalToday, thisMonth: totalThisMonth, lastMonth: totalLastMonth, currency: "HKD" };
      console.log(`[adsense] YouTube revenue aggregated across ${channelIdsToFetch.length} channel(s)`);
    } catch (e: any) {
      const friendly = formatGoogleError(e);
      errors.push(`YouTube: ${friendly}`);
      console.error("[adsense] YouTube fetch error (full):", JSON.stringify(e.response?.data || e, null, 2));
    }
  }

  return {
    isConfigured: true,
    adsense,
    youtube,
    errors: errors.length > 0 ? errors : undefined,
  };
}

async function handleIncome(_req: Request, res: Response) {
  try {
    const result = await fetchRevenue();
    res.json(result);
  } catch (e: any) {
    console.error("[adsense] Unexpected error in /income:", e);
    res.status(500).json({ message: "Failed to fetch revenue: " + (e.message || e) });
  }
}

async function handleTest(_req: Request, res: Response) {
  // Run the same fetch but also attempt a very small validation query for each source
  // so the user gets immediate feedback on credential validity.
  const adsClientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;
  const adsClientSecret = process.env.GOOGLE_ADSENSE_CLIENT_SECRET;
  const adsRefreshToken = process.env.GOOGLE_ADSENSE_REFRESH_TOKEN;
  const accountId = process.env.GOOGLE_ADSENSE_ACCOUNT_ID;

  const ytClientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
  const ytClientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET;
  const ytRefreshToken = process.env.GOOGLE_YOUTUBE_REFRESH_TOKEN;
  const ytChannelConfig = process.env.GOOGLE_YOUTUBE_CHANNEL_ID || "AUTO";

  const result: any = {
    timestamp: new Date().toISOString(),
    adsense: { configured: false, ok: false, message: "Not configured" },
    youtube: { configured: false, ok: false, message: "Not configured (set GOOGLE_YOUTUBE_CHANNEL_ID=AUTO or your channel/content owner ID)" },
  };

  let adsenseClient = null;
  if (adsRefreshToken) {
    adsenseClient = new OAuth2Client(adsClientId || "not-used", adsClientSecret || "not-used");
    adsenseClient.setCredentials({ refresh_token: adsRefreshToken });
  }

  let youtubeClient = null;
  if (ytRefreshToken) {
    youtubeClient = new OAuth2Client(ytClientId || "not-used", ytClientSecret || "not-used");
    youtubeClient.setCredentials({ refresh_token: ytRefreshToken });
  }

  // Test AdSense
  if (adsClientId && adsClientSecret && accountId && adsenseClient) {
    result.adsense.configured = true;
    try {
      // Use a narrow historical range that is likely to exist (use CUSTOM for last month)
      const dates = getReportDates();
      const val = await getAdSenseReport(adsenseClient, accountId, dates.lastMonth);
      result.adsense.ok = true;
      result.adsense.message = `OK — sample last month: $${val.toFixed(2)} (HKD)`;
      result.adsense.sample = val;
    } catch (e: any) {
      result.adsense.ok = false;
      result.adsense.message = formatGoogleError(e);
    }
  }

  // Test YouTube
  if (ytRefreshToken && youtubeClient) {
    result.youtube.configured = true;
    const dates = getReportDates();
    try {
      let channelIdsToFetch: string[] = [];
      if (ytChannelConfig.toUpperCase() === "AUTO") {
        const discoveredChannels = await listUserChannels(youtubeClient);
        const discoveredOwners = await listContentOwners(youtubeClient);
        channelIdsToFetch = Array.from(new Set([...discoveredChannels, ...discoveredOwners]));
        if (channelIdsToFetch.length === 0) {
          channelIdsToFetch = ["MINE"];
        }
      } else {
        channelIdsToFetch = [ytChannelConfig];
      }

      let total = 0;
      for (const ch of channelIdsToFetch) {
        total += await getYouTubeReport(youtubeClient, ch, dates.lastMonth.start, dates.lastMonth.end);
      }

      result.youtube.ok = true;
      let msg = `OK — last month (${dates.lastMonth.start} to ${dates.lastMonth.end}) estimatedRevenue across ${channelIdsToFetch.length} channel(s): $${total.toFixed(2)} (HKD)`;
      if (total === 0) {
        msg += " (zero may be normal due to data delay — check YouTube Studio for same dates. Check server logs for [adsense] YouTube API details (no rows, headers, discovered IDs). If the wrong channel was used, hardcode the correct channel/content owner ID.)";
      }
      result.youtube.message = msg;
      result.youtube.sample = total;
      result.youtube.channelsQueried = channelIdsToFetch;
      result.youtube.discoveryUsed = ytChannelConfig.toUpperCase() === "AUTO";
    } catch (e: any) {
      result.youtube.ok = false;
      result.youtube.message = formatGoogleError(e);
      console.error("[adsense] YouTube test error (full):", JSON.stringify(e.response?.data || e, null, 2));
    }
  }

  res.json(result);
}

export function registerAdSenseRoutes(app: Express) {
  // Protected by the requireAuth middleware that callers apply before calling this
  app.get("/api/adsense/income", handleIncome);
  app.get("/api/adsense/test", handleTest);
}

export { fetchRevenue }; // exported for potential future use / tests
