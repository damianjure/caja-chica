/**
 * TDD tests for POST /api/extract-image
 *
 * Covers:
 * - mime validation (allowlist: jpeg, png, webp, gif, pdf)
 * - size cap enforcement (≤ 7MB decoded base64)
 * - auth gate (401 without session)
 * - success path → returns ReceiptItemsResult shape
 * - Gemini capacity error → 503 { error: "ai_unavailable" }
 * - extractFromBuffer / extractItemsFromBuffer shared fns: upload/generate/delete lifecycle
 * - HANDWRITTEN fallback on low confidence
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";
import { extractItemsFromBuffer } from "../src/server/imageExtract.ts";
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

/** Minimal genAI stub — returns a valid receipt-items JSON (2 line items) */
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
            empresa: "Carrefour",
            cuit: null,
            moneda: "ARS",
            fecha: "2026-05-30",
            total: 2000,
            confidence: 0.95,
            items: [
              { descripcion: "Leche", monto: 1200, cantidad: 1, categoria: "Supermercado" },
              { descripcion: "Pan", monto: 800, cantidad: 2, categoria: "Panadería" },
            ],
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
      body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "image/svg+xml" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.equal(body.error, "unsupported_mime_type");
  });
});

test("POST /api/extract-image — application/pdf accepted (tickets/facturas)", async () => {
  await withServer(
    { resolveSession: async () => memberSession, genAI: makeGenAI() as any },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/extract-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ image: TINY_PNG_B64, mimeType: "application/pdf" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.sourceType, "pdf");
    },
  );
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

test("POST /api/extract-image — 200 returns ReceiptItemsResult shape", async () => {
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
      // Must have ReceiptItemsResult fields
      assert.ok("empresa" in body);
      assert.ok("cuit" in body);
      assert.ok("moneda" in body);
      assert.ok("fecha" in body);
      assert.ok("total" in body);
      assert.ok("confidence" in body);
      assert.ok("items" in body);
      assert.ok("sourceType" in body);
      // Values from stub
      assert.equal(body.empresa, "Carrefour");
      assert.equal(body.total, 2000);
      assert.equal(body.sourceType, "photo");
      assert.equal(body.items.length, 2);
      assert.equal(body.items[0].descripcion, "Leche");
      assert.equal(body.items[0].categoria, "Supermercado");
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
// extractItemsFromBuffer unit tests
// ─────────────────────────────────────────────

/** genAI stub returning a receipt-items JSON with N line items. */
function makeItemsGenAI(itemsJson: unknown) {
  return {
    files: {
      async upload() { return { name: "files/items-1", uri: "gs://gemini/items-1", mimeType: "image/jpeg" }; },
      async delete() {},
    },
    models: {
      async generateContent() { return { text: JSON.stringify(itemsJson) }; },
    },
  };
}

test("extractItemsFromBuffer — returns items + metadata on confident receipt", async () => {
  const genAI = makeItemsGenAI({
    empresa: "Coto", cuit: null, moneda: "ARS", fecha: "2026-06-01", total: 2000, confidence: 0.9,
    items: [
      { descripcion: "Leche", monto: 1200, cantidad: 1, categoria: "Supermercado" },
      { descripcion: "Pan", monto: 800, cantidad: 1, categoria: "Panadería" },
    ],
  });
  const buf = Buffer.from(TINY_PNG_B64, "base64");
  const { result, sourceType } = await extractItemsFromBuffer({ genAI: genAI as any, imageBuffer: buf, mimeType: "image/jpeg" });
  assert.equal(sourceType, "photo");
  assert.equal(result.empresa, "Coto");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].descripcion, "Pan");
});

test("extractItemsFromBuffer — pdf mime yields sourceType pdf", async () => {
  const genAI = makeItemsGenAI({
    empresa: "Coto", cuit: null, moneda: "ARS", fecha: null, total: 1200, confidence: 0.9,
    items: [{ descripcion: "Café", monto: 1200, cantidad: 1, categoria: "Bar" }],
  });
  const buf = Buffer.from(TINY_PNG_B64, "base64");
  const { sourceType } = await extractItemsFromBuffer({ genAI: genAI as any, imageBuffer: buf, mimeType: "application/pdf" });
  assert.equal(sourceType, "pdf");
});

test("extractItemsFromBuffer — HANDWRITTEN fallback returns single-movement shape (items: [])", async () => {
  let callCount = 0;
  const fakeGenAI: any = {
    files: {
      async upload() { return { name: `files/h-${callCount}`, uri: `gs://gemini/h-${callCount}`, mimeType: "image/jpeg" }; },
      async delete() {},
    },
    models: {
      async generateContent() {
        callCount++;
        if (callCount === 1) {
          // Low confidence, no items → triggers fallback
          return { text: JSON.stringify({ empresa: null, cuit: null, moneda: "ARS", fecha: null, total: null, confidence: 0.2, items: [] }) };
        }
        // HANDWRITTEN single-movement JSON
        return { text: JSON.stringify({ monto: 500, moneda: "ARS", tipo: "egreso", empresa: "Kiosco", cuit: null, categoria: "Varios", descripcion: "kiosco", fecha: null, confidence: 0.7 }) };
      },
    },
  };
  const buf = Buffer.from(TINY_PNG_B64, "base64");
  const { result, sourceType } = await extractItemsFromBuffer({ genAI: fakeGenAI, imageBuffer: buf, mimeType: "image/jpeg" });
  assert.equal(callCount, 2, "should fall back to HANDWRITTEN");
  assert.equal(sourceType, "handwritten");
  assert.equal(result.total, 500);
  assert.equal(result.empresa, "Kiosco");
  assert.deepEqual(result.items, []);
});
