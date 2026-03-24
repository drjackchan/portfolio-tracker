/**
 * Stateless HMAC-signed token auth — works across serverless instances.
 *
 * On login we create a signed token: base64(payload).HMAC-SHA256(payload, secret)
 * and store it in an httpOnly cookie. No database or shared memory needed —
 * works correctly on Vercel serverless where each request may hit a fresh instance.
 *
 * Environment variables:
 *   APP_PASSWORD   — the plaintext password (set in Vercel env vars)
 *   SESSION_SECRET — random secret for signing tokens (set in Vercel env vars)
 *
 * If APP_PASSWORD is not set, auth is disabled (open access for local dev).
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = "ptk";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-change-in-prod-32chars!!";
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Create a signed auth token */
function createToken(): string {
  const payload = Buffer.from(JSON.stringify({ auth: true, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Verify a token — returns true if valid */
function verifyToken(token: string): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  try {
    // Constant-time compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Middleware: reject unauthenticated requests */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled()) return next();
  const token = req.cookies?.[COOKIE_NAME];
  if (token && verifyToken(token)) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/** POST /api/auth/login */
export function handleLogin(req: Request, res: Response) {
  if (!authEnabled()) return res.json({ ok: true });

  const { password } = req.body ?? {};
  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Password required" });
  }

  const expected = sha256(process.env.APP_PASSWORD!);
  const provided  = sha256(password);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  res.cookie(COOKIE_NAME, createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
  res.json({ ok: true });
}

/** POST /api/auth/logout */
export function handleLogout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
}

/** GET /api/auth/check */
export function handleAuthCheck(req: Request, res: Response) {
  if (!authEnabled()) return res.json({ authenticated: true, authRequired: false });
  const token = req.cookies?.[COOKIE_NAME];
  const ok = !!(token && verifyToken(token));
  res.status(ok ? 200 : 401).json({ authenticated: ok, authRequired: true });
}
