import test from "node:test";
import assert from "node:assert/strict";

import { loadReportData, generateAndDeliverReport } from "../src/flows/reports.ts";
import { listRecurrentesWithNextRun, createRecurrente, toggleRecurrente } from "../src/flows/recurring.ts";
import { FakeChannel, fakeIncoming } from "../src/channels/fake.ts";

const MOVS = [
  { id: "1", created_at: "2026-06-05T10:00:00.000Z", tipo: "egreso", moneda: "ARS", monto: 5000, empresa_nombre: "Carrefour", categoria: "Super", descripcion: "compra" },
  { id: "2", created_at: "2026-05-10T10:00:00.000Z", tipo: "ingreso", moneda: "ARS", monto: 20000, empresa_nombre: "Personal", categoria: "Ventas", descripcion: "cobro" },
];

function supabaseReturning(rows: unknown[]) {
  const builder: any = {
    select: () => builder,
    is: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    insert: (rowsIn: unknown[]) => Promise.resolve({ error: null, _inserted: rowsIn }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
  };
  return { from: () => builder, builder } as any;
}

const identityScope = (q: any) => q;

// --- reports core ---

test("loadReportData: filtra por período sobre el scope", async () => {
  const { from } = supabaseReturning(MOVS);
  const loaded = await loadReportData({ from } as any, identityScope, {
    period: "month",
    month: "2026-06",
    companies: [],
  });
  assert.ok(loaded);
  assert.equal(loaded!.filtered.length, 1);
  assert.equal(loaded!.filtered[0].id, "1");
});

test("loadReportData: período inválido → null", async () => {
  const { from } = supabaseReturning(MOVS);
  const loaded = await loadReportData({ from } as any, identityScope, {
    period: "range",
    companies: [],
  });
  assert.equal(loaded, null);
});

test("generateAndDeliverReport: destino local → sendFile por el canal", async () => {
  const { from } = supabaseReturning(MOVS);
  const ch = new FakeChannel(fakeIncoming());
  await generateAndDeliverReport(ch, { from } as any, identityScope, {
    period: "month",
    month: "2026-06",
    companies: [],
  }, { format: "csv", destination: "local" });

  const files = ch.ofKind("file");
  assert.equal(files.length, 1);
  assert.match(files[0].file.filename, /^informe_todos_month_2026-06\.csv$/);
  assert.match(files[0].file.caption ?? "", /1 movimientos/);
});

test("generateAndDeliverReport: drive sin owner → mensaje de error, sin archivo", async () => {
  const { from } = supabaseReturning(MOVS);
  const ch = new FakeChannel(fakeIncoming());
  await generateAndDeliverReport(ch, { from } as any, identityScope, {
    period: "month",
    month: "2026-06",
    companies: [],
  }, { format: "pdf", destination: "drive", resolveDriveOwnerUserId: async () => null });

  assert.equal(ch.ofKind("file").length, 0);
  assert.match(ch.ofKind("text")[0].text, /dueño del dashboard/);
});

// --- recurring core ---

test("listRecurrentesWithNextRun: computa próximo pago", async () => {
  const { from } = supabaseReturning([
    { id: "r1", descripcion: "Netflix", monto: 5000, moneda: "ARS", frecuencia: "semanal", last_processed: "2026-06-08T00:00:00.000Z", day_of_month: null, is_active: true },
  ]);
  const recs = await listRecurrentesWithNextRun({ from } as any, identityScope, new Date("2026-06-10T12:00:00.000Z"));
  assert.equal(recs.length, 1);
  assert.equal(recs[0].next_run_at?.slice(0, 10), "2026-06-15");
  assert.ok(recs[0].next_run_label);
});

test("createRecurrente: inserta con ownership + defaults de categoría", async () => {
  let inserted: any[] = [];
  const supabase: any = {
    from: () => ({ insert: (rows: any[]) => { inserted = rows; return Promise.resolve({ error: null }); } }),
  };
  const ok = await createRecurrente(supabase, {
    ownership: { dashboard_id: "d1", created_by_user_id: "u1" },
    monto: 788,
    tipo: "egreso",
    moneda: "ARS",
    frecuencia: "mensual",
    descripcion: "Alquiler",
    dayOfMonth: 5,
    notifyChatId: 123,
  });
  assert.equal(ok, true);
  assert.equal(inserted[0].dashboard_id, "d1");
  assert.equal(inserted[0].categoria, "Varios");
  assert.equal(inserted[0].day_of_month, 5);
  assert.equal(inserted[0].chat_id, 123);
});

test("createRecurrente: day_of_month solo aplica para frecuencia mensual", async () => {
  let inserted: any[] = [];
  const supabase: any = {
    from: () => ({ insert: (rows: any[]) => { inserted = rows; return Promise.resolve({ error: null }); } }),
  };
  await createRecurrente(supabase, {
    ownership: { owner_user_id: "o1" },
    monto: 100,
    tipo: "ingreso",
    moneda: "ARS",
    frecuencia: "semanal",
    descripcion: "Sueldo",
    dayOfMonth: 10,
  });
  assert.equal(inserted[0].day_of_month, null);
  assert.equal(inserted[0].categoria, "Ingresos");
});

test("toggleRecurrente: pausa un activo → ok", async () => {
  const rec = { id: "r1", is_active: true, descripcion: "Netflix", monto: 5000, moneda: "ARS" };
  const { from } = supabaseReturning([rec]);
  const result = await toggleRecurrente({ from } as any, identityScope, "r1", false, () => true);
  assert.equal(result.status, "ok");
  assert.equal(result.rec.descripcion, "Netflix");
});

test("toggleRecurrente: ya estaba en ese estado → already", async () => {
  const { from } = supabaseReturning([{ id: "r1", is_active: false }]);
  const result = await toggleRecurrente({ from } as any, identityScope, "r1", false, () => true);
  assert.equal(result.status, "already");
});

test("toggleRecurrente: sin permiso → not_found", async () => {
  const { from } = supabaseReturning([{ id: "r1", is_active: true }]);
  const result = await toggleRecurrente({ from } as any, identityScope, "r1", false, () => false);
  assert.equal(result.status, "not_found");
});
