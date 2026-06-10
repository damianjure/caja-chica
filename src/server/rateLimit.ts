import type { Request, RequestHandler, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFn: (req: Request) => string | null;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimitOptions): RequestHandler {
  const store = new Map<string, RateLimitEntry>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, opts.windowMs);

  const maybeUnref = (sweep as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(sweep);

  return (req: Request, res: Response, next) => {
    const key = opts.keyFn(req);
    if (key === null) return next();

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + opts.windowMs };
      store.set(key, entry);
    } else {
      entry.count++;
    }

    const remaining = Math.max(0, opts.max - entry.count);
    const resetSec = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", opts.max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSec);

    if (entry.count > opts.max) {
      res.setHeader("Retry-After", resetSec);
      return res.status(429).json({ error: "rate_limit_exceeded" });
    }

    next();
  };
}

// The FIRST X-Forwarded-For entry is client-supplied (spoofable). The LAST one
// is appended by the trusted LB in front of Cloud Run, so that's the real client.
export function clientIp(req: Request): string {
  const raw = req.headers["x-forwarded-for"];
  const chain = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return chain.at(-1) ?? req.socket.remoteAddress ?? "unknown";
}

function userOrIp(req: Request): string {
  const userId = req.session?.userId;
  if (userId) return `u:${userId}`;
  return `ip:${clientIp(req)}`;
}

function ipOnly(req: Request): string {
  return `ip:${clientIp(req)}`;
}

export const tierRead = createRateLimiter({ windowMs: 60_000, max: 300, keyFn: userOrIp });
export const tierWrite = createRateLimiter({ windowMs: 60_000, max: 120, keyFn: userOrIp });
export const tierAuth = createRateLimiter({ windowMs: 60_000, max: 20, keyFn: ipOnly });
export const tierStrict = createRateLimiter({ windowMs: 60_000, max: 30, keyFn: userOrIp });
export const tierResend = createRateLimiter({ windowMs: 60_000, max: 10, keyFn: userOrIp });
// Test-send: 3 per day per admin. Prevents abuse of the test-send endpoint.
export const tierEmailTest = createRateLimiter({ windowMs: 24 * 60 * 60_000, max: 3, keyFn: userOrIp });
// Reporte de problema: 3 por día por usuario. Evita spam al superadmin.
export const tierSupportReport = createRateLimiter({ windowMs: 24 * 60 * 60_000, max: 3, keyFn: userOrIp });
