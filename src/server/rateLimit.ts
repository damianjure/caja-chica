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

function userOrIp(req: Request): string {
  const userId = req.session?.userId;
  if (userId) return `u:${userId}`;
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  return `ip:${ip}`;
}

function ipOnly(req: Request): string {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  return `ip:${ip}`;
}

export const tierRead = createRateLimiter({ windowMs: 60_000, max: 300, keyFn: userOrIp });
export const tierWrite = createRateLimiter({ windowMs: 60_000, max: 120, keyFn: userOrIp });
export const tierAuth = createRateLimiter({ windowMs: 60_000, max: 20, keyFn: ipOnly });
export const tierStrict = createRateLimiter({ windowMs: 60_000, max: 30, keyFn: userOrIp });
export const tierResend = createRateLimiter({ windowMs: 60_000, max: 10, keyFn: userOrIp });
