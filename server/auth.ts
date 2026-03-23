/**
 * Simple password-based session auth.
 *
 * Environment variables:
 *   APP_PASSWORD   — the plaintext password you choose (set in Vercel env vars)
 *   SESSION_SECRET — random secret for signing cookies (set in Vercel env vars)
 *
 * If APP_PASSWORD is not set, auth is disabled (open access) so local dev
 * without the env var still works.
 */
import { createHash, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

/** Hash a string with SHA-256 for safe comparison */
function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** True if APP_PASSWORD env var is configured */
export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Middleware: reject requests that aren't authenticated */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled()) return next(); // no password set → open access
  if ((req.session as any)?.authenticated === true) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/** POST /api/auth/login — check password, set session */
export function handleLogin(req: Request, res: Response) {
  if (!authEnabled()) {
    return res.json({ ok: true });
  }

  const { password } = req.body ?? {};
  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Password required" });
  }

  const expected = sha256(process.env.APP_PASSWORD!);
  const provided = sha256(password);

  // Constant-time compare to prevent timing attacks
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  (req.session as any).authenticated = true;
  req.session.save(() => {
    res.json({ ok: true });
  });
}

/** POST /api/auth/logout — destroy session */
export function handleLogout(req: Request, res: Response) {
  req.session.destroy(() => {
    res.clearCookie("ptk"); // match session cookie name below
    res.json({ ok: true });
  });
}

/** GET /api/auth/check — lightweight ping to check session */
export function handleAuthCheck(req: Request, res: Response) {
  if (!authEnabled()) return res.json({ authenticated: true, authRequired: false });
  const ok = (req.session as any)?.authenticated === true;
  res.status(ok ? 200 : 401).json({ authenticated: ok, authRequired: true });
}
