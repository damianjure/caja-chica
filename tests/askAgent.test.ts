import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAskAgentResponse,
  executeAskTool,
  answerQuestion,
  fetchMovimientosForAsk,
  fetchRecurrentesForAsk,
  ASK_MAX_TURNS,
  ASK_FALLBACK_ANSWER,
  type AskMovimiento,
  type AskRecurrente,
} from "../src/server/askAgent.ts";

const TODAY = new Date("2026-06-10T12:00:00.000Z");

const MOVS: AskMovimiento[] = [
  { created_at: "2026-06-09T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 5000, categoria: "Supermercado", empresa_nombre: "Carrefour", descripcion: "Compra semanal" },
  { created_at: "2026-06-08T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 3000, categoria: "Combustible", empresa_nombre: "YPF", descripcion: "Nafta" },
  { created_at: "2026-06-05T10:00:00.000Z", tipo: "ingreso", moneda: "ARS", monto: 20000, categoria: "Ventas", empresa_nombre: "Personal", descripcion: "Cobro cliente" },
  { created_at: "2026-06-01T10:00:00.000Z", tipo: "egreso", moneda: "USD", monto: 50, categoria: "Suscripciones", empresa_nombre: "Personal", descripcion: "Netflix" },
  { created_at: "2026-05-15T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 8000, categoria: "Supermercado", empresa_nombre: "Coto", descripcion: "Compra mayo" },
  { created_at: "2026-05-12T04:58:55.000Z", tipo: "egreso", moneda: "USD", monto: 3000000, categoria: "caramelos", empresa_nombre: "Servicios Delta", descripcion: "Ngate, tres palos verdes en caramelos." },
  { created_at: "2026-05-10T10:00:00.000Z", tipo: "ingreso", moneda: "ARS", monto: 15000, categoria: "Ventas", empresa_nombre: "Personal", descripcion: "Cobro mayo" },
];

// --- parseAskAgentResponse ---

test("parseAskAgentResponse: tool call válido", () => {
  const step = parseAskAgentResponse('{"tool": "get_saldos", "args": {"period": "mes"}}');
  assert.deepEqual(step, { kind: "tool", tool: "get_saldos", args: { period: "mes" } });
});

test("parseAskAgentResponse: tool call sin args → args vacío", () => {
  const step = parseAskAgentResponse('{"tool": "get_resumen_mensual"}');
  assert.deepEqual(step, { kind: "tool", tool: "get_resumen_mensual", args: {} });
});

test("parseAskAgentResponse: answer válido", () => {
  const step = parseAskAgentResponse('{"answer": "Gastaste $8.000 este mes."}');
  assert.deepEqual(step, { kind: "answer", answer: "Gastaste $8.000 este mes." });
});

test("parseAskAgentResponse: tolera fences de markdown", () => {
  const step = parseAskAgentResponse('```json\n{"answer": "ok"}\n```');
  assert.deepEqual(step, { kind: "answer", answer: "ok" });
});

test("parseAskAgentResponse: basura → null", () => {
  assert.equal(parseAskAgentResponse("no soy json"), null);
  assert.equal(parseAskAgentResponse('[1,2]'), null);
  assert.equal(parseAskAgentResponse('{"foo": 1}'), null);
  assert.equal(parseAskAgentResponse('{"tool": 42}'), null);
  assert.equal(parseAskAgentResponse('{"answer": 42}'), null);
});

// --- executeAskTool ---

test("get_saldos: totales por moneda sin filtros", () => {
  const r = executeAskTool("get_saldos", {}, MOVS, TODAY) as any;
  assert.equal(r.ars.ingresos, 35000);
  assert.equal(r.ars.gastos, 16000);
  assert.equal(r.ars.neto, 19000);
  assert.equal(r.usd.gastos, 3000050);
  assert.equal(r.movimientos, 7);
});

test("get_saldos: period 'mes' filtra al mes calendario actual", () => {
  const r = executeAskTool("get_saldos", { period: "mes" }, MOVS, TODAY) as any;
  // junio: 5000 + 3000 egresos ARS, 20000 ingreso ARS, 50 USD egreso
  assert.equal(r.ars.gastos, 8000);
  assert.equal(r.ars.ingresos, 20000);
  assert.equal(r.usd.gastos, 50);
  assert.equal(r.movimientos, 4);
});

test("get_saldos: from/to explícitos", () => {
  const r = executeAskTool("get_saldos", { from: "2026-05-01", to: "2026-05-31" }, MOVS, TODAY) as any;
  assert.equal(r.ars.gastos, 8000);
  assert.equal(r.ars.ingresos, 15000);
  assert.equal(r.usd.gastos, 3000000);
  assert.equal(r.movimientos, 3);
});

test("get_saldos: filtro por categoría incluye USD de caramelos en mayo", () => {
  const r = executeAskTool("get_saldos", { from: "2026-05-01", to: "2026-05-31", categoria: "Caramelos" }, MOVS, TODAY) as any;
  assert.equal(r.usd.gastos, 3000000);
  assert.equal(r.movimientos, 1);
});

test("get_saldos: fallback empresa→categoría evita falso cero para rubros", () => {
  const r = executeAskTool("get_saldos", { from: "2026-05-01", to: "2026-05-31", empresa: "caramelos" }, MOVS, TODAY) as any;
  assert.equal(r.usd.gastos, 3000000);
  assert.equal(r.movimientos, 1);
});

// "caramelos" en producción vive en descripcion, no en categoria.
const CARAMELO_MOVS: AskMovimiento[] = [
  { created_at: "2026-06-08T00:30:07.000Z", tipo: "egreso", moneda: "ARS", monto: 5000, categoria: "golosinas", empresa_nombre: "Personal", descripcion: "caramelo" },
  { created_at: "2026-06-08T00:29:16.000Z", tipo: "egreso", moneda: "ARS", monto: 5000, categoria: "Otros", empresa_nombre: "Personal", descripcion: "La tesis, en caramelos." },
  { created_at: "2026-06-06T15:31:57.000Z", tipo: "egreso", moneda: "ARS", monto: 1000, categoria: "Otros", empresa_nombre: "hola", descripcion: "caramelos" },
  { created_at: "2026-06-01T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 999, categoria: "Otros", empresa_nombre: "Personal", descripcion: "Nafta" },
];

test("get_saldos: buscar 'caramelos' matchea descripcion (singular y plural)", () => {
  const r = executeAskTool("get_saldos", { buscar: "caramelos" }, CARAMELO_MOVS, TODAY) as any;
  // 3 movimientos con caramelo/caramelos en descripcion, NO el de Nafta
  assert.equal(r.movimientos, 3);
  assert.equal(r.ars.gastos, 11000);
});

test("get_movimientos: buscar matchea descripcion además de categoria/empresa", () => {
  const r = executeAskTool("get_movimientos", { buscar: "caramelo" }, CARAMELO_MOVS, TODAY) as any;
  assert.equal(r.length, 3);
  assert.ok(r.every((m: any) => /caramelo/i.test(m.descripcion)));
});

test("get_saldos: buscar sin coincidencias → cero real", () => {
  const r = executeAskTool("get_saldos", { buscar: "helicoptero" }, CARAMELO_MOVS, TODAY) as any;
  assert.equal(r.movimientos, 0);
});

test("get_saldos: filtro por empresa", () => {
  const r = executeAskTool("get_saldos", { empresa: "Carrefour" }, MOVS, TODAY) as any;
  assert.equal(r.ars.gastos, 5000);
  assert.equal(r.movimientos, 1);
});

test("get_top_categorias: ordena por gasto y limita", () => {
  const r = executeAskTool("get_top_categorias", { limit: 2 }, MOVS, TODAY) as any;
  assert.equal(r.length, 2);
  assert.equal(r[0].categoria, "Supermercado");
  assert.equal(r[0].ars, 13000);
});

test("get_movimientos: filtra por categoria y limita", () => {
  const r = executeAskTool("get_movimientos", { categoria: "Supermercado" }, MOVS, TODAY) as any;
  assert.equal(r.length, 2);
  assert.equal(r[0].empresa, "Carrefour");
  const limited = executeAskTool("get_movimientos", { limit: 1 }, MOVS, TODAY) as any;
  assert.equal(limited.length, 1);
});

test("get_movimientos: cap duro de 30 aunque pidan más", () => {
  const many: AskMovimiento[] = Array.from({ length: 40 }, (_, i) => ({
    created_at: `2026-06-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
    tipo: "egreso", moneda: "ARS", monto: 100, categoria: "X", empresa_nombre: "Y", descripcion: `m${i}`,
  }));
  const r = executeAskTool("get_movimientos", { limit: 999 }, many, TODAY) as any;
  assert.equal(r.length, 30);
});

test("get_resumen_mensual: agrupa por mes", () => {
  const r = executeAskTool("get_resumen_mensual", {}, MOVS, TODAY) as any;
  assert.ok(Array.isArray(r));
  const junio = r.find((m: any) => m.mes === "2026-06");
  assert.ok(junio);
  assert.equal(junio.gastosArs, 8000);
  assert.equal(junio.ingresosArs, 20000);
});

test("tool desconocida → error", () => {
  const r = executeAskTool("drop_table", {}, MOVS, TODAY) as any;
  assert.equal(r.error, "unknown_tool");
});

// --- calcular (A) ---

test("calcular: porcentaje sobre un total", () => {
  const r = executeAskTool("calcular", { op: "porcentaje", base: 11000, pct: 21 }, MOVS, TODAY) as any;
  assert.equal(r.resultado, 2310);
});

test("calcular: diferencia con relativo en %", () => {
  const r = executeAskTool("calcular", { op: "diferencia", a: 8000, b: 10000 }, MOVS, TODAY) as any;
  assert.equal(r.resultado, -2000);
  assert.equal(r.relativo_pct, -20);
});

test("calcular: ratio con guard de división por cero", () => {
  const r = executeAskTool("calcular", { op: "ratio", a: 5, b: 0 }, MOVS, TODAY) as any;
  assert.equal(r.resultado, null);
});

test("calcular: promedio", () => {
  const r = executeAskTool("calcular", { op: "promedio", valores: [10, 20, 30] }, MOVS, TODAY) as any;
  assert.equal(r.resultado, 20);
});

test("calcular: promedio sobre lista vacía → 0", () => {
  const r = executeAskTool("calcular", { op: "promedio", valores: [] }, MOVS, TODAY) as any;
  assert.equal(r.resultado, 0);
});

test("calcular: operación desconocida → error", () => {
  const r = executeAskTool("calcular", { op: "raiz" }, MOVS, TODAY) as any;
  assert.equal(r.error, "unknown_op");
});

// --- get_recurrentes (B) ---

const RECURRENTES: AskRecurrente[] = [
  { descripcion: "Netflix", monto: 5000, moneda: "ARS", frecuencia: "semanal", categoria: "Suscripciones", empresa_nombre: "Personal", last_processed: "2026-06-08T00:00:00.000Z", day_of_month: null, tipo: "egreso" },
  { descripcion: "Dominio web", monto: 12000, moneda: "ARS", frecuencia: "anual", categoria: "Servicios", empresa_nombre: "Personal", last_processed: "2026-03-01T00:00:00.000Z", day_of_month: null, tipo: "egreso" },
];

test("get_recurrentes: mapea próximo pago y ordena por más cercano", () => {
  const r = executeAskTool("get_recurrentes", {}, MOVS, TODAY, RECURRENTES) as any;
  assert.equal(r.length, 2);
  assert.equal(r[0].descripcion, "Netflix");
  assert.equal(r[0].proximo_pago, "2026-06-15");
  assert.equal(r[0].monto, 5000);
  assert.equal(r[1].descripcion, "Dominio web");
  assert.equal(r[1].proximo_pago, "2027-03-01");
});

test("get_recurrentes: ventana 'dias' filtra los que vencen pronto", () => {
  const r = executeAskTool("get_recurrentes", { dias: 7 }, MOVS, TODAY, RECURRENTES) as any;
  assert.equal(r.length, 1);
  assert.equal(r[0].descripcion, "Netflix");
});

test("get_recurrentes: last_processed null → se activa esta noche, entra en la ventana", () => {
  const recs: AskRecurrente[] = [
    { descripcion: "Luz", monto: 3000, moneda: "ARS", frecuencia: "mensual", last_processed: null, day_of_month: null, tipo: "egreso" },
  ];
  const r = executeAskTool("get_recurrentes", { dias: 7 }, MOVS, TODAY, recs) as any;
  assert.equal(r.length, 1);
  assert.equal(r[0].proximo_pago, null);
  assert.equal(r[0].cuando, "se activa esta noche");
});

test("get_recurrentes: sin recurrentes → lista vacía", () => {
  const r = executeAskTool("get_recurrentes", {}, MOVS, TODAY, []) as any;
  assert.deepEqual(r, []);
});

test("answerQuestion: get_recurrentes usa los recurrentes pasados", async () => {
  const genAI = fakeGenAI([
    '{"tool": "get_recurrentes", "args": {}}',
    '{"answer": "Tu próximo pago es Netflix el 2026-06-15."}',
  ]);
  const answer = await answerQuestion({
    genAI: genAI as any,
    movimientos: MOVS,
    recurrentes: RECURRENTES,
    question: "¿próximo pago?",
    today: TODAY,
  });
  assert.equal(answer, "Tu próximo pago es Netflix el 2026-06-15.");
  assert.ok(genAI.calls[1].contents.includes("Netflix"));
  assert.ok(genAI.calls[1].contents.includes("2026-06-15"));
});

test("fetchRecurrentesForAsk: filtra is_active + deleted_at y aplica scope", async () => {
  const seen: Array<[string, string, unknown]> = [];
  const builder: any = {
    select: () => builder,
    eq: (c: string, v: unknown) => { seen.push(["eq", c, v]); return builder; },
    is: (c: string, v: unknown) => { seen.push(["is", c, v]); return builder; },
  };
  const supabase: any = { from: () => builder };
  const rows = await fetchRecurrentesForAsk(supabase, (q: any) => {
    assert.equal(q, builder);
    return Promise.resolve({ data: [{ descripcion: "X", monto: 1, moneda: "ARS", frecuencia: "mensual" }], error: null });
  });
  assert.equal(rows.length, 1);
  assert.ok(seen.some((s) => s[1] === "is_active" && s[2] === true));
  assert.ok(seen.some((s) => s[1] === "deleted_at" && s[2] === null));
});

test("fetchRecurrentesForAsk: propaga error de Supabase", async () => {
  const builder: any = { select: () => builder, eq: () => builder, is: () => builder };
  const supabase: any = { from: () => builder };
  await assert.rejects(() =>
    fetchRecurrentesForAsk(supabase, () => Promise.resolve({ data: null, error: { message: "boom" } })),
  );
});

// --- answerQuestion (loop) ---

function fakeGenAI(responses: string[]) {
  const calls: Array<{ contents: string; systemInstruction: string }> = [];
  let i = 0;
  return {
    calls,
    models: {
      async generateContent(args: { model: string; contents: string; config: { systemInstruction: string } }) {
        calls.push({ contents: args.contents, systemInstruction: args.config.systemInstruction });
        const text = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return { text };
      },
    },
  };
}

test("answerQuestion: tool call → resultado en contexto → answer", async () => {
  const genAI = fakeGenAI([
    '{"tool": "get_saldos", "args": {"period": "mes"}}',
    '{"answer": "Este mes gastaste $8.000."}',
  ]);
  const answer = await answerQuestion({
    genAI: genAI as any,
    movimientos: MOVS,
    question: "¿cuánto gasté este mes?",
    today: TODAY,
  });
  assert.equal(answer, "Este mes gastaste $8.000.");
  assert.equal(genAI.calls.length, 2);
  // el segundo turno debe incluir el resultado del tool
  assert.ok(genAI.calls[1].contents.includes("get_saldos"));
  assert.ok(genAI.calls[1].contents.includes("8000"));
  // y la pregunta original
  assert.ok(genAI.calls[1].contents.includes("cuánto gasté"));
});

test("answerQuestion: history previo entra al transcript", async () => {
  const genAI = fakeGenAI(['{"answer": "Un 12% menos que mayo."}']);
  const answer = await answerQuestion({
    genAI: genAI as any,
    movimientos: MOVS,
    question: "¿y comparado con mayo?",
    history: [
      { role: "user", content: "¿cuánto gasté este mes?" },
      { role: "assistant", content: "Gastaste $8.000." },
    ],
    today: TODAY,
  });
  assert.equal(answer, "Un 12% menos que mayo.");
  const contents = genAI.calls[0].contents;
  assert.ok(contents.includes("¿cuánto gasté este mes?"));
  assert.ok(contents.includes("Gastaste $8.000."));
  // la pregunta nueva va después del historial
  assert.ok(contents.indexOf("¿y comparado con mayo?") > contents.indexOf("Gastaste $8.000."));
});

test("answerQuestion: corta en ASK_MAX_TURNS si nunca responde", async () => {
  const genAI = fakeGenAI(['{"tool": "get_saldos", "args": {}}']);
  const answer = await answerQuestion({
    genAI: genAI as any,
    movimientos: MOVS,
    question: "loop infinito",
    today: TODAY,
  });
  assert.equal(answer, ASK_FALLBACK_ANSWER);
  assert.equal(genAI.calls.length, ASK_MAX_TURNS);
});

test("answerQuestion: respuesta no parseable → fallback", async () => {
  const genAI = fakeGenAI(["esto no es json"]);
  const answer = await answerQuestion({
    genAI: genAI as any,
    movimientos: MOVS,
    question: "qué onda",
    today: TODAY,
  });
  assert.equal(answer, ASK_FALLBACK_ANSWER);
});

// --- fetchMovimientosForAsk ---

test("fetchMovimientosForAsk: pagina hasta agotar", async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => ({ created_at: "2026-06-01", tipo: "egreso", moneda: "ARS", monto: i }));
  const page2 = [{ created_at: "2026-06-02", tipo: "ingreso", moneda: "ARS", monto: 1 }];
  const pages = [page1, page2];
  let rangeCalls = 0;
  const builder: any = {
    select: () => builder,
    is: () => builder,
    order: () => builder,
    range: (_from: number, _to: number) => {
      const data = pages[rangeCalls] ?? [];
      rangeCalls += 1;
      return Promise.resolve({ data, error: null });
    },
  };
  const supabase: any = { from: () => builder };
  const rows = await fetchMovimientosForAsk(supabase, (q: any) => q);
  assert.equal(rows.length, 1001);
  assert.equal(rangeCalls, 2);
});

test("fetchMovimientosForAsk: propaga error de Supabase", async () => {
  const builder: any = {
    select: () => builder,
    is: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  const supabase: any = { from: () => builder };
  await assert.rejects(() => fetchMovimientosForAsk(supabase, (q: any) => q));
});
