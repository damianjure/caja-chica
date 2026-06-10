/**
 * Fase D — Telegram save-first ticket persist + recompute.
 *
 * persistTelegramTicket inserts a parent movimiento (total, empresa Personal,
 * merchant in the description — never auto-created) + child lines, mirroring
 * the web POST /ticket. recomputeTelegramTicketTotal keeps the parent total in
 * sync after a line is removed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { persistTelegramTicket, recomputeTelegramTicketTotal } from "../src/bot/commands/movements.ts";
import type { TelegramLinkRecord } from "../src/server/telegramAccess.ts";
import type { ReceiptItemsResult } from "../src/server/gemini.ts";

const linked: TelegramLinkRecord = {
  userId: null,
  dashboardId: null,
  ownerUserId: "owner-1",
  role: null,
  permissions: {},
  username: null,
  remindersEnabled: true,
  linkTokenExpiresAt: null,
};

function makeStore() {
  const tables: Record<string, any[]> = {};
  let idc = 0;
  const nid = (p: string) => `${p}-${++idc}`;
  function from(name: string) {
    const rows = tables[name] ?? (tables[name] = []);
    const filters: Array<[string, any]> = [];
    const isF: Array<[string, any]> = [];
    let op: null | { kind: "update" | "delete"; patch?: any } = null;
    let lim: number | null = null;
    function match() {
      let r = rows.filter(
        (row) =>
          filters.every(([c, v]) => row[c] === v || String(row[c]) === String(v)) &&
          isF.every(([c, v]) => (v === null ? row[c] === null || row[c] === undefined : row[c] === v)),
      );
      if (lim != null) r = r.slice(0, lim);
      return r;
    }
    function exec() {
      if (op?.kind === "update") { for (const row of match()) Object.assign(row, op.patch); return { data: null, error: null }; }
      if (op?.kind === "delete") { for (const row of match()) { const i = rows.indexOf(row); if (i >= 0) rows.splice(i, 1); } return { data: null, error: null }; }
      return { data: match(), error: null };
    }
    const b: any = {
      select() { return b; },
      is(c: string, v: any) { isF.push([c, v]); return b; },
      eq(c: string, v: any) { filters.push([c, v]); return b; },
      order() { return b; },
      limit(n: number) { lim = n; return b; },
      update(patch: any) { op = { kind: "update", patch }; return b; },
      delete() { op = { kind: "delete" }; return b; },
      insert(input: any) {
        const arr = Array.isArray(input) ? input : [input];
        const inserted = arr.map((r: any) => {
          const row = { id: nid(name), created_at: new Date().toISOString(), deleted_at: null, ...r };
          rows.push(row);
          return row;
        });
        return {
          select() { return Promise.resolve({ data: inserted, error: null }); },
          single() { return Promise.resolve({ data: inserted[0], error: null }); },
          then(res: any) { return res({ data: inserted, error: null }); },
        };
      },
      then(resolve: any) { return resolve(exec()); },
    };
    return b;
  }
  return { tables, supabase: { from } };
}

const meta: ReceiptItemsResult = {
  documentKind: "receipt",
  empresa: "Carrefour",
  cuit: null,
  moneda: "ARS",
  fecha: "2026-06-08",
  total: 2000,
  confidence: 0.9,
  items: [
    { descripcion: "Leche", monto: 1200, cantidad: 1, categoria: "Supermercado" },
    { descripcion: "Pan", monto: 800, cantidad: 2, categoria: "Panadería" },
  ],
};

test("persistTelegramTicket — saves parent total + lines, empresa Personal, merchant in description", async () => {
  const store = makeStore();
  const out = await persistTelegramTicket(store.supabase as any, { linked, meta, sourceType: "photo" });
  assert.ok(out);
  assert.equal(out!.total, 2000);
  assert.equal(out!.lineCount, 2);
  assert.equal(out!.merchant, "Carrefour");

  const parent = store.tables.movimientos[0];
  assert.equal(parent.empresa_nombre, "Personal", "merchant must NOT become the empresa");
  assert.equal(parent.descripcion, "Carrefour", "merchant goes to the description");
  assert.equal(parent.tipo, "egreso");
  assert.equal(parent.monto, 2000);
  assert.equal(parent.has_lineas, true);
  assert.equal(store.tables.movimiento_lineas.length, 2);
  // No empresa auto-created.
  assert.equal((store.tables.empresas ?? []).length, 0);
});

test("persistTelegramTicket — returns null when no payable lines", async () => {
  const store = makeStore();
  const out = await persistTelegramTicket(store.supabase as any, {
    linked,
    meta: { ...meta, items: [{ descripcion: "x", monto: null, cantidad: null, categoria: "Varios" }] },
    sourceType: "photo",
  });
  assert.equal(out, null);
  assert.equal((store.tables.movimientos ?? []).length, 0);
});

test("recomputeTelegramTicketTotal — reflects a removed line", async () => {
  const store = makeStore();
  const out = await persistTelegramTicket(store.supabase as any, { linked, meta, sourceType: "photo" });
  // Soft-delete the Pan line (800).
  const pan = store.tables.movimiento_lineas.find((l) => l.descripcion === "Pan");
  pan.deleted_at = new Date().toISOString();

  const total = await recomputeTelegramTicketTotal(store.supabase as any, out!.movId, linked);
  assert.equal(total, 1200);
  const parent = store.tables.movimientos.find((m) => m.id === out!.movId);
  assert.equal(parent.monto, 1200);
  assert.equal(parent.has_lineas, true);
});
