import test from "node:test";
import assert from "node:assert/strict";

import { WaSim } from "./helpers/waSim.ts";

// Linked owner + empty data tables. Same op-agnostic fake as the router test:
// every query resolves to the configured rows for its table.
function fakeSupabase(tables: Record<string, unknown[]>, captured?: { inserts: any[] }) {
  function builder(table: string) {
    const rows = tables[table] ?? [];
    const b: any = {
      select: () => b,
      insert: (payload: any) => { captured?.inserts.push({ table, payload }); return b; },
      update: () => b,
      eq: () => b, neq: () => b, gt: () => b, is: () => b, order: () => b,
      limit: () => Promise.resolve({ data: rows, error: null }),
      range: () => Promise.resolve({ data: rows, error: null }),
      then: (r: (v: any) => void) => r({ data: rows, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as any;
}

const fakeGenAI = { models: { async generateContent() { return { text: "{}" }; } } } as any;

function linkedOwnerTables(extra: Record<string, unknown[]> = {}) {
  return {
    whatsapp_links: [{ id: "l1", app_user_id: "u1", dashboard_id: "d1", status: "active" }],
    dashboard_members: [{ role: "owner", status: "active", permissions: {} }],
    movimientos: [],
    ...extra,
  };
}

test("guided informe: /informes → período → tipo → formato → documento enviado", async () => {
  const sim = new WaSim({ supabase: fakeSupabase(linkedOwnerTables()), genAI: fakeGenAI });

  await sim.text("/informes");
  assert.equal(sim.lastInteractiveType(), "list"); // period menu

  await sim.pickRow("rp:mes");
  assert.equal(sim.lastInteractiveType(), "list"); // tipo menu

  await sim.pickRow("rt:egr");
  assert.equal(sim.lastInteractiveType(), "button"); // format buttons

  await sim.tapButton("rf:csv");
  // Report delivered as a document.
  const last = sim.last() as any;
  assert.equal(last.type, "document");
  assert.match(last.document.filename, /\.csv$/);
  assert.equal(sim.uploads.length, 1);
});

test("guided informe: período inválido → re-pregunta, no avanza", async () => {
  const sim = new WaSim({ supabase: fakeSupabase(linkedOwnerTables()), genAI: fakeGenAI });
  await sim.text("/informes");
  await sim.tapButton("garbage");
  // Still on the period step (list re-shown).
  assert.equal(sim.lastInteractiveType(), "list");
});

test("guided recurrente: monto → tipo → moneda → frecuencia → descripción → insert", async () => {
  const captured = { inserts: [] as any[] };
  const sim = new WaSim({ supabase: fakeSupabase(linkedOwnerTables(), captured), genAI: fakeGenAI });

  await sim.text("/recurrente");
  assert.match((sim.last() as any).text.body, /monto/i);

  await sim.text("1500");
  assert.equal(sim.lastInteractiveType(), "button"); // tipo

  await sim.tapButton("rct:egreso");
  assert.equal(sim.lastInteractiveType(), "button"); // moneda

  await sim.tapButton("rcm:ARS");
  assert.equal(sim.lastInteractiveType(), "list"); // frecuencia

  await sim.pickRow("rc:mensual");
  assert.match((sim.last() as any).text.body, /descripción/i);

  await sim.text("Alquiler");
  const rec = captured.inserts.find((i) => i.table === "recurrentes");
  assert.ok(rec);
  assert.equal(rec.payload[0].monto, 1500);
  assert.equal(rec.payload[0].tipo, "egreso");
  assert.equal(rec.payload[0].frecuencia, "mensual");
  assert.equal(rec.payload[0].descripcion, "Alquiler");
  assert.match((sim.last() as any).text.body, /cargué el recurrente/i);
});

test("guided recurrente: /cancelar a mitad → limpia la sesión", async () => {
  const sim = new WaSim({ supabase: fakeSupabase(linkedOwnerTables()), genAI: fakeGenAI });
  await sim.text("/recurrente");
  await sim.text("/cancelar");
  assert.match((sim.last() as any).text.body, /cancel/i);
  // After cancel, an unknown message falls through to help (no active session).
  await sim.text("hola");
  assert.match((sim.last() as any).text.body, /Comandos/);
});
