import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";

import { parseAskRequest, ASK_QUESTION_MAX_LENGTH } from "../src/server/validation.ts";
import { createAskRouter } from "../src/server/routes/ask.ts";

// --- parseAskRequest ---

test("parseAskRequest: pregunta válida → trimmed, history vacío por defecto", () => {
  assert.deepEqual(parseAskRequest({ question: "  ¿cuánto gasté?  " }), { question: "¿cuánto gasté?", history: [] });
});

test("parseAskRequest: rechaza vacío, no-string y demasiado largo", () => {
  assert.equal(parseAskRequest({}), null);
  assert.equal(parseAskRequest({ question: "" }), null);
  assert.equal(parseAskRequest({ question: 42 }), null);
  assert.equal(parseAskRequest(null), null);
  assert.equal(parseAskRequest({ question: "x".repeat(ASK_QUESTION_MAX_LENGTH + 1) }), null);
});

test("parseAskRequest: history válido pasa, items inválidos se filtran", () => {
  const r = parseAskRequest({
    question: "¿y comparado con mayo?",
    history: [
      { role: "user", content: " ¿cuánto gasté este mes? " },
      { role: "assistant", content: "Gastaste $863.500." },
      { role: "system", content: "ignorame" },
      { role: "user", content: "" },
      { role: "user", content: 42 },
      "basura",
    ],
  });
  assert.ok(r);
  assert.deepEqual(r.history, [
    { role: "user", content: "¿cuánto gasté este mes?" },
    { role: "assistant", content: "Gastaste $863.500." },
  ]);
});

test("parseAskRequest: history capea a los últimos 10 turnos y trunca contenido", () => {
  const turns = Array.from({ length: 14 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `turno ${i} ` + "x".repeat(2000),
  }));
  const r = parseAskRequest({ question: "sigo", history: turns });
  assert.ok(r);
  assert.equal(r.history.length, 10);
  assert.ok(r.history[0].content.startsWith("turno 4"));
  assert.ok(r.history.every((t) => t.content.length <= 1000));
});

test("parseAskRequest: history no-array → []", () => {
  const r = parseAskRequest({ question: "hola", history: "nope" });
  assert.ok(r);
  assert.deepEqual(r.history, []);
});

// --- POST /api/ask ---

function buildApp(overrides: Partial<Parameters<typeof createAskRouter>[0]> = {}) {
  const movRows = [
    { created_at: "2026-06-09T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 5000, categoria: "Super", empresa_nombre: "Carrefour", descripcion: "compra" },
  ];
  const builder: any = {
    select: () => builder,
    is: () => builder,
    order: () => builder,
    range: (from: number) => Promise.resolve({ data: from === 0 ? movRows : [], error: null }),
    eq: () => builder,
  };
  const supabase: any = { from: () => builder };
  const genAI: any = {
    models: {
      async generateContent() {
        return { text: '{"answer": "Gastaste $5.000."}' };
      },
    },
  };
  const session = { userId: "user-1", email: "u@x.com", role: "member", status: "active" };
  const deps = {
    supabase,
    genAI,
    genAI2: null,
    requireSession: ((req: any, _res: any, next: any) => { req.session = session; next(); }) as any,
    getSession: (req: any) => req.session,
    resolveDataAccessScope: async () => ({ dashboardId: null, membershipRole: null, memberPermissions: {} }),
    applyDataScope: (q: any) => q,
    parseAskRequest,
    tierStrict: ((_req: any, _res: any, next: any) => next()) as any,
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(createAskRouter(deps as any));
  return app;
}

async function postAsk(app: express.Express, body: unknown): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test("POST /api/ask: responde answer", async () => {
  const { status, body } = await postAsk(buildApp(), { question: "¿cuánto gasté?" });
  assert.equal(status, 200);
  assert.equal(body.answer, "Gastaste $5.000.");
});

test("POST /api/ask: 400 con body inválido", async () => {
  const { status, body } = await postAsk(buildApp(), { question: "" });
  assert.equal(status, 400);
  assert.equal(body.error, "invalid_request");
});

test("POST /api/ask: 503 cuando Gemini está sin cuota", async () => {
  const { GeminiUnavailableError } = await import("../src/server/geminiWithFallback.ts");
  const genAI: any = {
    models: {
      async generateContent() {
        throw new GeminiUnavailableError();
      },
    },
  };
  const { status, body } = await postAsk(buildApp({ genAI }), { question: "hola" });
  assert.equal(status, 503);
  assert.equal(body.error, "ai_unavailable");
});
