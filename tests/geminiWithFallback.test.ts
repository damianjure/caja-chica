/**
 * Tests for Gemini fallback + availability detection.
 *
 * Strict TDD: written first (RED) — they reference isGeminiCapacityError
 * (renamed from isQuotaError, now also covering 503 / model-overload) and the
 * geminiGenerateText fallback contract.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  GeminiUnavailableError,
  isGeminiCapacityError,
  geminiGenerateText,
  withMediaKeyFallback,
} from "../src/server/geminiWithFallback.ts";
import type { GenAILike } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Helpers — fake GenAI clients
// ---------------------------------------------------------------------------

function err(status?: number, message?: string): Error & { status?: number } {
  const e = new Error(message ?? "boom") as Error & { status?: number };
  if (status !== undefined) e.status = status;
  return e;
}

function clientThatReturns(text: string): GenAILike {
  return {
    models: {
      async generateContent() {
        return { text };
      },
    },
  };
}

function clientThatThrows(toThrow: unknown): GenAILike {
  return {
    models: {
      async generateContent(): Promise<never> {
        throw toThrow;
      },
    },
  };
}

const args = {
  model: "gemini-2.5-flash-lite",
  contents: "pagué 4500 de luz",
  config: { systemInstruction: "extract" },
};

// ---------------------------------------------------------------------------
// isGeminiCapacityError
// ---------------------------------------------------------------------------

test("isGeminiCapacityError — 429 status is a capacity error (quota)", () => {
  assert.equal(isGeminiCapacityError(err(429, "Too Many Requests")), true);
});

test("isGeminiCapacityError — RESOURCE_EXHAUSTED message is a capacity error", () => {
  assert.equal(isGeminiCapacityError(err(undefined, "RESOURCE_EXHAUSTED: quota")), true);
});

test("isGeminiCapacityError — 503 status is a capacity error (overload)", () => {
  assert.equal(isGeminiCapacityError(err(503, "Service Unavailable")), true);
});

test("isGeminiCapacityError — UNAVAILABLE message is a capacity error", () => {
  assert.equal(isGeminiCapacityError(err(undefined, "UNAVAILABLE")), true);
});

test("isGeminiCapacityError — 'model is overloaded' message is a capacity error", () => {
  assert.equal(
    isGeminiCapacityError(err(undefined, "The model is overloaded. Please try again later.")),
    true,
  );
});

test("isGeminiCapacityError — 400 / other errors are NOT capacity errors", () => {
  assert.equal(isGeminiCapacityError(err(400, "Invalid argument")), false);
});

test("isGeminiCapacityError — null / non-object is not a capacity error", () => {
  assert.equal(isGeminiCapacityError(null), false);
  assert.equal(isGeminiCapacityError("nope"), false);
});

// ---------------------------------------------------------------------------
// geminiGenerateText
// ---------------------------------------------------------------------------

test("geminiGenerateText — primary success returns its result; fallback untouched", async () => {
  let fallbackCalled = false;
  const fallback: GenAILike = {
    models: {
      async generateContent() {
        fallbackCalled = true;
        return { text: "fallback" };
      },
    },
  };
  const out = await geminiGenerateText(clientThatReturns("primary"), fallback, args);
  assert.equal(out.text, "primary");
  assert.equal(fallbackCalled, false);
});

test("geminiGenerateText — primary 429 then fallback success returns fallback result", async () => {
  const out = await geminiGenerateText(
    clientThatThrows(err(429, "RESOURCE_EXHAUSTED")),
    clientThatReturns("fallback"),
    args,
  );
  assert.equal(out.text, "fallback");
});

test("geminiGenerateText — primary 503 (overload) then fallback success returns fallback result", async () => {
  const out = await geminiGenerateText(
    clientThatThrows(err(503, "The model is overloaded")),
    clientThatReturns("fallback"),
    args,
  );
  assert.equal(out.text, "fallback");
});

test("geminiGenerateText — primary capacity error, no fallback configured → GeminiUnavailableError", async () => {
  await assert.rejects(
    () => geminiGenerateText(clientThatThrows(err(429, "RESOURCE_EXHAUSTED")), null, args),
    GeminiUnavailableError,
  );
});

test("geminiGenerateText — both keys exhausted → GeminiUnavailableError", async () => {
  await assert.rejects(
    () =>
      geminiGenerateText(
        clientThatThrows(err(429, "RESOURCE_EXHAUSTED")),
        clientThatThrows(err(429, "RESOURCE_EXHAUSTED")),
        args,
      ),
    GeminiUnavailableError,
  );
});

test("geminiGenerateText — primary non-capacity error rethrows original (no fallback attempt)", async () => {
  const original = err(400, "Invalid argument");
  await assert.rejects(
    () => geminiGenerateText(clientThatThrows(original), clientThatReturns("fallback"), args),
    (thrown: unknown) => thrown === original,
  );
});

test("geminiGenerateText — fallback non-capacity error rethrows that error", async () => {
  const fallbackErr = err(400, "Invalid argument from fallback");
  await assert.rejects(
    () =>
      geminiGenerateText(
        clientThatThrows(err(429, "RESOURCE_EXHAUSTED")),
        clientThatThrows(fallbackErr),
        args,
      ),
    (thrown: unknown) => thrown === fallbackErr,
  );
});

// ---------------------------------------------------------------------------
// withMediaKeyFallback — media flows re-run download/upload with the 2nd key
// ---------------------------------------------------------------------------

test("withMediaKeyFallback — primary success: fallback never runs", async () => {
  const used: string[] = [];
  const out = await withMediaKeyFallback("primary", "fallback", async (client) => {
    used.push(client as string);
    return "ok";
  });
  assert.equal(out, "ok");
  assert.deepEqual(used, ["primary"]);
});

test("withMediaKeyFallback — primary capacity error → re-runs whole op with fallback client", async () => {
  const used: string[] = [];
  const out = await withMediaKeyFallback("primary", "fallback", async (client) => {
    used.push(client as string);
    if (client === "primary") throw err(429, "RESOURCE_EXHAUSTED");
    return "from-fallback";
  });
  assert.equal(out, "from-fallback");
  assert.deepEqual(used, ["primary", "fallback"]);
});

test("withMediaKeyFallback — GeminiUnavailableError from primary also triggers fallback", async () => {
  const out = await withMediaKeyFallback("primary", "fallback", async (client) => {
    if (client === "primary") throw new GeminiUnavailableError();
    return "from-fallback";
  });
  assert.equal(out, "from-fallback");
});

test("withMediaKeyFallback — no fallback configured → GeminiUnavailableError", async () => {
  await assert.rejects(
    () => withMediaKeyFallback("primary", null, async () => { throw err(429, "RESOURCE_EXHAUSTED"); }),
    GeminiUnavailableError,
  );
});

test("withMediaKeyFallback — both keys exhausted → GeminiUnavailableError", async () => {
  await assert.rejects(
    () => withMediaKeyFallback("primary", "fallback", async () => { throw err(429, "RESOURCE_EXHAUSTED"); }),
    GeminiUnavailableError,
  );
});

test("withMediaKeyFallback — non-capacity error rethrows original, no fallback attempt", async () => {
  const original = err(400, "Invalid argument");
  const used: string[] = [];
  await assert.rejects(
    () => withMediaKeyFallback("primary", "fallback", async (client) => {
      used.push(client as string);
      throw original;
    }),
    (thrown: unknown) => thrown === original,
  );
  assert.deepEqual(used, ["primary"]);
});
