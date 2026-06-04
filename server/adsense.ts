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
  dateRange: "TODAY" | "MONTH_TO_DATE" | "LAST_MONTH"
): Promise<number> {
  const fullAccountId = accountId.startsWith("accounts/")
    ? accountId
    : `accounts/${accountId}`;
  const url = `https://adsense.googleapis.com/v2/${fullAccountId}/reports:generate?dateRange=${dateRange}&metrics=ESTIMATED_EARNINGS`;
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
  const ids =
    channelId.toUpperCase() === "MINE" || channelId.startsWith("UC")
      ? `channel==${channelId}`
      : `channel==${channelId}`;
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=${encodeURIComponent(
    ids
  )}&startDate=${startDate}&endDate=${endDate}&metrics=estimatedRevenue&currency=USD`;
  const response = await oauth2Client.request({ url });
  const data = response.data as any;
  if (data.rows && data.rows.length > 0) {
    // Single metric, no extra dimensions => first (only) value in the row
    return parseFloat(data.rows[0][0] || "0");
  }
  return 0;
}

function formatGoogleError(e: any): string {
  const msg = e?.response?.data?.error?.message || e?.message || String(e);
  let hint = "";

  if (msg.includes("invalid_grant") || msg.toLowerCase().includes("expired or revoked")) {
    hint = " (Refresh token invalid/revoked — re-authorize via OAuth Playground with the required scopes and get a fresh refresh_token.)";
  } else if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("permission") || msg.includes("accessNotConfigured")) {
    hint = " (Missing scope or API not enabled. For YouTube revenue you must include yt-analytics-monetary.readonly when generating the token. Also enable the AdSense Management API and YouTube Analytics API in Google Cloud Console.)";
  } else if (msg.includes("account")) {
    hint = " (Check that GOOGLE_ADSENSE_ACCOUNT_ID or the YouTube channel ID is correct for your account.)";
  }
  return msg + hint;
}

async function fetchRevenue(): Promise<RevenueResponse> {
  const clientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADSENSE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADSENSE_REFRESH_TOKEN;
  const accountId = process.env.GOOGLE_ADSENSE_ACCOUNT_ID;
  const ytChannelId = process.env.GOOGLE_YOUTUBE_CHANNEL_ID;

  const hasAdSenseCreds = !!(clientId && clientSecret && refreshToken && accountId);
  const hasYT = !!(refreshToken && ytChannelId);

  if (!hasAdSenseCreds && !hasYT) {
    return { isConfigured: false, adsense: null, youtube: null };
  }

  if (!refreshToken) {
    return { isConfigured: false, adsense: null, youtube: null };
  }

  const oauth2Client = new OAuth2Client(clientId || "not-used", clientSecret || "not-used");
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const dates = getReportDates();
  let adsense: SourceData | null = null;
  let youtube: SourceData | null = null;
  const errors: string[] = [];

  if (hasAdSenseCreds) {
    try {
      const [today, thisMonth, lastMonth] = await Promise.all([
        getAdSenseReport(oauth2Client, accountId!, "TODAY"),
        getAdSenseReport(oauth2Client, accountId!, "MONTH_TO_DATE"),
        getAdSenseReport(oauth2Client, accountId!, "LAST_MONTH"),
      ]);
      adsense = { today, thisMonth, lastMonth, currency: "USD" };
    } catch (e: any) {
      const friendly = formatGoogleError(e);
      errors.push(`AdSense: ${friendly}`);
      console.error("[adsense] AdSense fetch error:", e.response?.data || e.message);
    }
  }

  if (hasYT) {
    try {
      const [today, thisMonth, lastMonth] = await Promise.all([
        getYouTubeReport(oauth2Client, ytChannelId!, dates.today.start, dates.today.end),
        getYouTubeReport(oauth2Client, ytChannelId!, dates.thisMonth.start, dates.thisMonth.end),
        getYouTubeReport(oauth2Client, ytChannelId!, dates.lastMonth.start, dates.lastMonth.end),
      ]);
      youtube = { today, thisMonth, lastMonth, currency: "USD" };
    } catch (e: any) {
      const friendly = formatGoogleError(e);
      errors.push(`YouTube: ${friendly}`);
      console.error("[adsense] YouTube fetch error:", e.response?.data || e.message);
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
  const clientId = process.env.GOOGLE_ADSENSE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADSENSE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADSENSE_REFRESH_TOKEN;
  const accountId = process.env.GOOGLE_ADSENSE_ACCOUNT_ID;
  const ytChannelId = process.env.GOOGLE_YOUTUBE_CHANNEL_ID;

  const result: any = {
    timestamp: new Date().toISOString(),
    adsense: { configured: false, ok: false, message: "Not configured" },
    youtube: { configured: false, ok: false, message: "Not configured" },
  };

  if (!refreshToken) {
    return res.json(result);
  }

  const oauth2Client = new OAuth2Client(clientId || "not-used", clientSecret || "not-used");
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Test AdSense
  if (clientId && clientSecret && accountId) {
    result.adsense.configured = true;
    try {
      // Use a narrow historical range that is likely to exist
      const testDate = "LAST_MONTH";
      const val = await getAdSenseReport(oauth2Client, accountId, testDate);
      result.adsense.ok = true;
      result.adsense.message = `OK — sample LAST_MONTH: $${val.toFixed(2)}`;
      result.adsense.sample = val;
    } catch (e: any) {
      result.adsense.ok = false;
      result.adsense.message = formatGoogleError(e);
    }
  }

  // Test YouTube
  if (ytChannelId) {
    result.youtube.configured = true;
    const dates = getReportDates();
    try {
      const val = await getYouTubeReport(oauth2Client, ytChannelId, dates.lastMonth.start, dates.lastMonth.end);
      result.youtube.ok = true;
      result.youtube.message = `OK — sample last month estimatedRevenue: $${val.toFixed(2)} (USD)`;
      result.youtube.sample = val;
    } catch (e: any) {
      result.youtube.ok = false;
      result.youtube.message = formatGoogleError(e);
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
