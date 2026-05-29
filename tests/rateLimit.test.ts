import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { createRateLimiter, tierEmailTest } from "../src/server/rateLimit.ts";

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    session: undefined,
    ...overrides,
  } as unknown as Request;
}

function fakeRes(): Response & { statusCode: number; body: unknown; headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; headers: Record<string, unknown> };
}

function callMiddleware(
  handler: ReturnType<typeof createRateLimiter>,
  req: Request,
  res: ReturnType<typeof fakeRes>,
): Promise<"next" | "blocked"> {
  return new Promise((resolve) => {
    handler(req, res as unknown as Response, () => resolve("next"));
    // If next was not called synchronously, the response was sent
    setImmediate(() => resolve("blocked"));
  });
}

test("allows up to max requests and blocks the N+1", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 3,
    keyFn: () => "fixed-key",
  });

  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    const result = await callMiddleware(limiter, fakeReq(), res);
    assert.equal(result, "next", `request ${i + 1} should pass`);
    assert.equal(res.statusCode, 200);
  }

  const res = fakeRes();
  const result = await callMiddleware(limiter, fakeReq(), res);
  assert.equal(result, "blocked");
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { error: "rate_limit_exceeded" });
});

test("sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    keyFn: () => "hdr-key",
  });

  const res = fakeRes();
  await callMiddleware(limiter, fakeReq(), res);

  assert.equal(res.headers["x-ratelimit-limit"], 5);
  assert.equal(res.headers["x-ratelimit-remaining"], 4);
  assert.ok(
    typeof res.headers["x-ratelimit-reset"] === "number" && res.headers["x-ratelimit-reset"] > 0,
    "X-RateLimit-Reset should be a positive number of seconds",
  );
});

test("sets Retry-After header when blocked", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyFn: () => "retry-key",
  });

  // first request passes
  await callMiddleware(limiter, fakeReq(), fakeRes());

  // second is blocked
  const res = fakeRes();
  await callMiddleware(limiter, fakeReq(), res);

  assert.equal(res.statusCode, 429);
  assert.ok(
    typeof res.headers["retry-after"] === "number" && res.headers["retry-after"] > 0,
    "Retry-After should be set on 429",
  );
});

test("different keys do not share counts", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyFn: (req) => (req as any).__key as string,
  });

  const reqA = fakeReq({ __key: "key-a" } as any);
  const reqB = fakeReq({ __key: "key-b" } as any);

  // exhaust key-a
  await callMiddleware(limiter, reqA, fakeRes());
  const resA = fakeRes();
  const blocked = await callMiddleware(limiter, reqA, resA);
  assert.equal(blocked, "blocked");
  assert.equal(resA.statusCode, 429);

  // key-b is independent
  const resB = fakeRes();
  const passB = await callMiddleware(limiter, reqB, resB);
  assert.equal(passB, "next");
  assert.equal(resB.statusCode, 200);
});

test("keyFn returning null skips rate limiting", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyFn: () => null,
  });

  // should never block regardless of call count
  for (let i = 0; i < 10; i++) {
    const res = fakeRes();
    const result = await callMiddleware(limiter, fakeReq(), res);
    assert.equal(result, "next", `request ${i + 1} should pass with null keyFn`);
  }
});

// -----------------------------------------------------------------------
// P2-T12: RED test for tierEmailTest (3/day/admin) (REQ-S3.3)
// -----------------------------------------------------------------------

test("tierEmailTest allows 3 requests and blocks the 4th within 24h window", async () => {
  // tierEmailTest is 3/day per user key.
  // We call it 4 times with the same user key; assert the 4th is blocked with 429.
  const req = fakeReq({ session: { userId: "admin-test-user" } } as any);

  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    const result = await callMiddleware(tierEmailTest, req, res);
    assert.equal(result, "next", `request ${i + 1} should pass`);
  }

  const res = fakeRes();
  const result = await callMiddleware(tierEmailTest, req, res);
  assert.equal(result, "blocked", "4th request should be blocked");
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { error: "rate_limit_exceeded" });
});

test("window resets after windowMs", async (t) => {
  const clock = t.mock.timers;
  clock.enable({ apis: ["Date"], now: 1_000_000 });

  const limiter = createRateLimiter({
    windowMs: 1_000,
    max: 1,
    keyFn: () => "reset-key",
  });

  // exhaust the window
  await callMiddleware(limiter, fakeReq(), fakeRes());
  const blocked = fakeRes();
  assert.equal((await callMiddleware(limiter, fakeReq(), blocked)), "blocked");

  // advance past the window
  clock.tick(1_100);

  const afterReset = fakeRes();
  const result = await callMiddleware(limiter, fakeReq(), afterReset);
  assert.equal(result, "next");
  assert.equal(afterReset.statusCode, 200);
});
