/**
 * TDD tests for POST /api/extract-image
 *
 * Covers:
 * - mime validation (allowlist: jpeg, png, webp, gif; pdf excluded from web)
 * - size cap enforcement (≤ 7MB decoded base64)
 * - auth gate (401 without session)
 * - success path → returns PendingExtractionData shape
 * - Gemini capacity error → 503 { error: "ai_unavailable" }
 * - extractFromBuffer shared fn: upload/generateContent/delete lifecycle
 * - extractFromBuffer HANDWRITTEN fallback on low confidence
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";
import { extractFromBuffer } from "../src/server/imageExtract.ts";
import { GeminiUnavailableError } from "../src/server/geminiWithFallback.ts";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const memberSession: AppSession = {
  userId: "user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
};

function makeSupabaseStub() {
  return {
    from(table: string) {
      const api: any = {
        select: () => api,
        eq: () => api,
        is: () => api,
        order: () => api,
        limit: () => Promise.resolve({ data: [], error: null }),
        insert: () => ({ select: () => Promise.resolve({ data: [{ id: "m-1" }], error: null }), single: () => Promise.resolve({ data: { id: "m-1" }, error: null }) }),
        update: () => ({ eq: () => Promise.resolve({ data: [], error: null }), then: (r: any) => r({ data: [], error: null }) }),
        upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
        single: () => Promise.resolve({ data: null, error: null }),
      };
      if (table === "dashboard_members") {
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === "audit_logs") {
        return { insert: () => ({ select: () => Promise.resolve({ data: [{ id: "al-1" }], error: null }) }) };
      }
      return api;
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

/** Minimal genAI stub — returns a valid receipt JSON */
function makeGenAI(opts?: { status?: number; message?: string }) {
  return {
    files: {
      async upload() {
        return { name: "files/test-1", uri: "gs://gemini/test-1", mimeType: "image/jpeg" };
      },
      async delete() {},
    },
    models: {
      async generateContent() {
        if (opts?.status || opts?.message) {
          const err: any = new Error(opts.message ?? "RESOURCE_EXHAUSTED");
          if (opts.status) err.status = opts.status;
          throw err;
        }
        return {
          text: JSON.stringify({
            monto: 1500,
            moneda: "ARS",
            tipo: "egreso",
            empresa: "Carrefour",
            cuit: null,
            categoria: "Supermercado",
            descripcion: "Compra supermercado",
            fecha: "2026-05-30",
            confidence: 0.95,
          }),
        };
      },
    },
  };
}

async function withServer(
  deps: Partial<AppDeps>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const supabase = makeSupabaseStub();
  const app = createApp({
    supabase: supabase as any,
    genAI: makeGenAI() as any,
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    resolveSession: async (token) => (token === "valid-token" ? memberSession : null),
    ...deps,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

/** 1×1 PNG as base64 (smallest valid image) */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ─────────────────────────────────────────────
// HTTP endpoint tests
// ─────────────────────────────────────────────

test("POST /api/extract-image — 401 without auth", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/jpeg" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /api/extract-image — oversize body without auth → 401, not 413 (auth runs before body parse)", async () => {
  // ~14.7MB base64 string, well over the 10MB router body limit.
  // If body parsing ran before auth, an unauthenticated caller would get 413
  // (and the server would have buffered 14MB). Correct order rejects with 401
  // before any parsing/buffering happens.
  const huge = Buffer.alloc(11 * 1024 * 1024, 0).toString("base64");
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: huge, mimeType: "image/jpeg" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /api/extract-image — 400 unsupported mime type", async () => {
  await withServer({ resolveSession: async () => memberSession }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "application/pdf" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.equal(body.error, "unsupported_mime_type");
  });
});

test("POST /api/extract-image — 400 for video/* mime", async () => {
  await withServer({ resolveSession: async () => memberSession }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "video/mp4" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/extract-image — 400 when image field missing", async () => {
  await withServer({ resolveSession: async () => memberSession }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ mimeType: "image/jpeg" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.equal(body.error, "invalid_request");
  });
});

test("POST /api/extract-image — 400 when image too large", async () => {
  // 7MB cap at base64-decoded level; to exceed after decode: >7*1024*1024 bytes decoded
  // Encode 8MB of zeros as base64 (~11MB base64 string)
  const bigBuffer = Buffer.alloc(8 * 1024 * 1024, 0);
  const bigB64 = bigBuffer.toString("base64");
  await withServer({ resolveSession: async () => memberSession }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/extract-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ image: bigB64, mimeType: "image/jpeg" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.equal(body.error, "image_too_large");
  });
});

test("POST /api/extract-image — 200 returns PendingExtractionData shape", async () => {
  await withServer(
    { resolveSession: async () => memberSession, genAI: makeGenAI() as any },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/extract-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/jpeg" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      // Must have PendingExtractionData fields
      assert.ok("monto" in body);
      assert.ok("moneda" in body);
      assert.ok("tipo" in body);
      assert.ok("empresa" in body);
      assert.ok("cuit" in body);
      assert.ok("categoria" in body);
      assert.ok("descripcion" in body);
      assert.ok("confidence" in body);
      assert.ok("sourceType" in body);
      // Values from stub
      assert.equal(body.monto, 1500);
      assert.equal(body.empresa, "Carrefour");
      assert.equal(body.sourceType, "photo");
    },
  );
});

test("POST /api/extract-image — 503 on Gemini capacity error (429)", async () => {
  await withServer(
    { resolveSession: async () => memberSession, genAI: makeGenAI({ status: 429 }) as any },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/extract-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/jpeg" }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.error, "ai_unavailable");
    },
  );
});

test("POST /api/extract-image — 503 on Gemini overload (RESOURCE_EXHAUSTED message)", async () => {
  await withServer(
    { resolveSession: async () => memberSession, genAI: makeGenAI({ message: "RESOURCE_EXHAUSTED: quota exceeded" }) as any },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/extract-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/jpeg" }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.error, "ai_unavailable");
    },
  );
});

test("POST /api/extract-image — png mime accepted", async () => {
  await withServer(
    { resolveSession: async () => memberSession, genAI: makeGenAI() as any },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/extract-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/png" }),
      });
      assert.equal(res.status, 200);
    },
  );
});

// ─────────────────────────────────────────────
// extractFromBuffer unit tests
// ─────────────────────────────────────────────

test("extractFromBuffer — uploads blob, generates, cleans up on success", async () => {
  const calls: string[] = [];

  const fakeGenAI: any = {
    files: {
      async upload() {
        calls.push("upload");
        return { name: "files/buf-1", uri: "gs://gemini/buf-1", mimeType: "image/jpeg" };
      },
      async delete() { calls.push("delete"); },
    },
    models: {
      async generateContent() {
        calls.push("generateContent");
        return {
          text: JSON.stringify({
            monto: 3200, moneda: "ARS", tipo: "egreso", empresa: "Disco",
            cuit: null, categoria: "Supermercado", descripcion: "compra",
            fecha: null, confidence: 0.88,
          }),
        };
      },
    },
  };

  const buf = Buffer.from(TINY_PNG_B64, "base64");
  const { result, sourceType } = await extractFromBuffer({
    genAI: fakeGenAI,
    imageBuffer: buf,
    mimeType: "image/jpeg",
  });

  assert.equal(result.monto, 3200);
  assert.equal(result.empresa, "Disco");
  assert.equal(result.confidence, 0.88);
  assert.equal(sourceType, "photo");
  assert.ok(calls.includes("upload"), "should upload");
  assert.ok(calls.includes("generateContent"), "should generateContent");
  assert.ok(calls.includes("delete"), "should delete (cleanup)");
});

test("extractFromBuffer — HANDWRITTEN fallback on confidence < 0.5", async () => {
  let callCount = 0;
  const fakeGenAI: any = {
    files: {
      async upload() {
        return { name: `files/buf-${callCount}`, uri: `gs://gemini/buf-${callCount}`, mimeType: "image/jpeg" };
      },
      async delete() {},
    },
    models: {
      async generateContent() {
        callCount++;
        if (callCount === 1) {
          return { text: JSON.stringify({ monto: null, moneda: "ARS", tipo: "egreso", empresa: null, cuit: null, categoria: "Varios", descripcion: "ilegible", fecha: null, confidence: 0.3 }) };
        }
        return { text: JSON.stringify({ monto: 500, moneda: "ARS", tipo: "egreso", empresa: "Kiosco", cuit: null, categoria: "Varios", descripcion: "kiosco", fecha: null, confidence: 0.65 }) };
      },
    },
  };

  const buf = Buffer.from(TINY_PNG_B64, "base64");
  const { result, sourceType } = await extractFromBuffer({
    genAI: fakeGenAI,
    imageBuffer: buf,
    mimeType: "image/jpeg",
  });

  assert.equal(callCount, 2, "should call generateContent twice");
  assert.equal(result.monto, 500);
  assert.equal(sourceType, "handwritten");
});

test("extractFromBuffer — throws GeminiUnavailableError on 429", async () => {
  const fakeGenAI: any = {
    files: {
      async upload() {
        return { name: "files/buf-err", uri: "gs://gemini/buf-err", mimeType: "image/jpeg" };
      },
      async delete() {},
    },
    models: {
      async generateContent() {
        const err: any = new Error("RESOURCE_EXHAUSTED");
        err.status = 429;
        throw err;
      },
    },
  };

  const buf = Buffer.from(TINY_PNG_B64, "base64");
  await assert.rejects(
    () => extractFromBuffer({ genAI: fakeGenAI, imageBuffer: buf, mimeType: "image/jpeg" }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiUnavailableError, `expected GeminiUnavailableError, got ${(err as Error).name}`);
      return true;
    },
  );
});

test("extractFromBuffer — sourceType is photo for jpeg, webp, png", async () => {
  const makeQuickGenAI = () => ({
    files: {
      async upload() { return { name: "f", uri: "gs://g/f", mimeType: "image/jpeg" }; },
      async delete() {},
    },
    models: {
      async generateContent() {
        return { text: JSON.stringify({ monto: 100, moneda: "ARS", tipo: "egreso", empresa: null, cuit: null, categoria: "Varios", descripcion: "test", fecha: null, confidence: 0.9 }) };
      },
    },
  });

  const buf = Buffer.from(TINY_PNG_B64, "base64");
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
    const { sourceType } = await extractFromBuffer({ genAI: makeQuickGenAI() as any, imageBuffer: buf, mimeType });
    assert.equal(sourceType, "photo", `expected 'photo' for ${mimeType}`);
  }
});
