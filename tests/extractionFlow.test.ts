import test from "node:test";
import assert from "node:assert/strict";

import { statementItemsToPending, insertExtractionMovement, saveExtractionBatch } from "../src/flows/extraction.ts";
import type { PendingExtraction } from "../src/server/extractionReview.ts";

function entryWith(data: Partial<PendingExtraction["data"]>, identity: Partial<PendingExtraction> = {}): PendingExtraction {
  return {
    id: identity.id ?? "e1",
    chatId: 1,
    dashboardId: identity.dashboardId ?? null,
    userId: identity.userId ?? null,
    ownerUserId: identity.ownerUserId ?? "owner-1",
    messageId: 0,
    awaitingCompany: false,
    expiresAt: Date.now() + 60_000,
    data: {
      monto: 100,
      moneda: "ARS",
      tipo: "egreso",
      empresa: "Personal",
      cuit: null,
      categoria: "Varios",
      descripcion: "test",
      fecha: null,
      confidence: 0.9,
      sourceType: "photo",
      ...data,
    },
  } as PendingExtraction;
}

function insertCapture() {
  const inserted: any[] = [];
  const supabase: any = {
    from: () => ({
      insert: (rows: any[]) => {
        inserted.push(...rows);
        return { select: () => Promise.resolve({ data: [{ id: `mov-${inserted.length}` }], error: null }) };
      },
    }),
  };
  return { supabase, inserted };
}

// --- statementItemsToPending ---

test("statementItemsToPending: filtra sin monto, default Personal, sourceType statement", () => {
  const pending = statementItemsToPending([
    { monto: 8500, moneda: "ARS", tipo: "egreso", empresa: "Amazon", categoria: "Electrónica", descripcion: "cuota 3/6", fecha: "2026-05-12", confidence: 0.95 },
    { monto: null, moneda: "ARS", tipo: "egreso", empresa: "X", categoria: "Varios", descripcion: "ilegible", fecha: null, confidence: 0.2 },
    { monto: 1200, moneda: "ARS", tipo: "ingreso", empresa: "  ", categoria: "Varios", descripcion: "reintegro", fecha: "2026-05-15", confidence: 0.9 },
  ] as any);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].sourceType, "statement");
  assert.equal(pending[0].empresa, "Amazon");
  assert.equal(pending[1].empresa, "Personal");
});

// --- insertExtractionMovement ---

test("insertExtractionMovement: statement conserva fecha real en created_at", async () => {
  const { supabase, inserted } = insertCapture();
  const entry = entryWith({ sourceType: "statement", fecha: "2026-05-12", monto: 8500 });
  const { id, error } = await insertExtractionMovement(supabase, entry);
  assert.equal(error, undefined);
  assert.ok(id);
  assert.equal(inserted[0].created_at, "2026-05-12T12:00:00.000Z");
  assert.equal(inserted[0].owner_user_id, "owner-1");
});

test("insertExtractionMovement: foto NO pisa created_at; ownership dashboard", async () => {
  const { supabase, inserted } = insertCapture();
  const entry = entryWith({ sourceType: "photo", fecha: "2026-05-12" }, { dashboardId: "d1", userId: "u1" });
  await insertExtractionMovement(supabase, entry);
  assert.equal(inserted[0].created_at, undefined);
  assert.equal(inserted[0].dashboard_id, "d1");
  assert.equal(inserted[0].created_by_user_id, "u1");
  assert.equal(inserted[0].owner_user_id, "u1");
});

// --- saveExtractionBatch ---

test("saveExtractionBatch: suma guardados y reporta ids", async () => {
  const { supabase } = insertCapture();
  const result = await saveExtractionBatch(supabase, [
    entryWith({ monto: 100 }, { id: "a" }),
    entryWith({ monto: 250 }, { id: "b" }),
  ]);
  assert.equal(result.saved, 2);
  assert.equal(result.total, 350);
  assert.deepEqual(result.savedIds, ["a", "b"]);
});

test("saveExtractionBatch: el que falla no entra en saved ni en savedIds", async () => {
  let call = 0;
  const supabase: any = {
    from: () => ({
      insert: () => ({
        select: () => {
          call += 1;
          return Promise.resolve(call === 1
            ? { data: null, error: { message: "boom" } }
            : { data: [{ id: "mov-2" }], error: null });
        },
      }),
    }),
  };
  const result = await saveExtractionBatch(supabase, [
    entryWith({ monto: 100 }, { id: "a" }),
    entryWith({ monto: 250 }, { id: "b" }),
  ]);
  assert.equal(result.saved, 1);
  assert.equal(result.total, 250);
  assert.deepEqual(result.savedIds, ["b"]);
});
