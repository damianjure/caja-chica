/**
 * Integration tests for the photo/ticket bot flow.
 *
 * Coverage:
 *  - createPendingExtraction: session is stored and retrievable
 *  - confirm flow: session is cleaned up after deletePendingExtraction
 *  - retry HANDWRITTEN when confidence < 0.5 (via extractFromPhoto mock)
 *  - edit field via inline keyboard: updatePendingExtraction sets editingField
 *  - TTL expiry: getPendingExtraction returns null for expired sessions
 *  - buildReviewCardText / buildReviewKeyboard: output shape
 *  - MediaGroupBuffer: 3 photos same group_id → 1 batch flush
 *
 * NOTE: inferMediaMimeType and extractFromPhoto (including HANDWRITTEN retry)
 * are already covered in tests/telegramMedia.test.ts — not duplicated here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createPendingExtraction,
  getPendingExtraction,
  getPendingExtractionByChat,
  updatePendingExtraction,
  deletePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
  type PendingExtraction,
} from "../src/server/extractionReview.ts";
import { MediaGroupBuffer } from "../src/server/mediaGroupBuffer.ts";
import type { PendingExtractionData } from "../src/server/validation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(overrides: Partial<PendingExtractionData> = {}): PendingExtractionData {
  return {
    monto: 1500,
    moneda: "ARS",
    tipo: "egreso",
    empresa: "Carrefour",
    cuit: null,
    categoria: "Supermercado",
    descripcion: "Compra supermercado",
    fecha: "2026-05-08",
    confidence: 0.92,
    sourceType: "photo",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createPendingExtraction — session stored and retrievable by id and by chatId
// ---------------------------------------------------------------------------

test("createPendingExtraction stores session and getPendingExtraction returns it", () => {
  const data = makeData();
  const entry = createPendingExtraction({
    chatId: 100001,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data,
    messageId: 42,
  });

  assert.ok(entry.id, "id should be set");
  assert.equal(entry.chatId, 100001);
  assert.equal(entry.editingField, null);
  assert.ok(entry.expiresAt > Date.now(), "expiresAt should be in the future");

  const fetched = getPendingExtraction(entry.id);
  assert.ok(fetched, "should be found by id");
  assert.equal(fetched!.id, entry.id);
  assert.equal(fetched!.data.empresa, "Carrefour");

  // cleanup
  deletePendingExtraction(entry.id);
});

// ---------------------------------------------------------------------------
// confirm flow: deletePendingExtraction clears the session
// ---------------------------------------------------------------------------

test("deletePendingExtraction removes session — simulates confirm", () => {
  const entry = createPendingExtraction({
    chatId: 100002,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data: makeData(),
    messageId: 43,
  });

  assert.ok(getPendingExtraction(entry.id), "session should exist before confirm");

  deletePendingExtraction(entry.id);

  assert.equal(getPendingExtraction(entry.id), null, "session should be gone after confirm");
});

// ---------------------------------------------------------------------------
// edit_monto callback: updatePendingExtraction sets editingField
// ---------------------------------------------------------------------------

test("updatePendingExtraction sets editingField — simulates edit_monto callback", () => {
  const entry = createPendingExtraction({
    chatId: 100003,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data: makeData(),
    messageId: 44,
  });

  assert.equal(entry.editingField, null);

  const updated = updatePendingExtraction(entry.id, { editingField: "monto" });
  assert.ok(updated, "updatePendingExtraction should return the entry");
  assert.equal(updated!.editingField, "monto");

  // verify the stored entry reflects the change
  const fetched = getPendingExtraction(entry.id);
  assert.equal(fetched!.editingField, "monto");

  deletePendingExtraction(entry.id);
});

// ---------------------------------------------------------------------------
// getPendingExtractionByChat: returns entry only when editingField is set
// ---------------------------------------------------------------------------

test("getPendingExtractionByChat returns entry only when editingField !== null", () => {
  const entry = createPendingExtraction({
    chatId: 100004,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data: makeData(),
    messageId: 45,
  });

  // editingField is null initially — should NOT be found by getPendingExtractionByChat
  assert.equal(
    getPendingExtractionByChat(100004),
    null,
    "should not find entry when editingField is null",
  );

  updatePendingExtraction(entry.id, { editingField: "empresa" });

  const found = getPendingExtractionByChat(100004);
  assert.ok(found, "should find entry once editingField is set");
  assert.equal(found!.id, entry.id);

  deletePendingExtraction(entry.id);
});

// ---------------------------------------------------------------------------
// updatePendingExtraction: data patch is merged correctly
// ---------------------------------------------------------------------------

test("updatePendingExtraction merges data patch without overwriting untouched fields", () => {
  const data = makeData({ monto: 500, empresa: "Disco" });
  const entry = createPendingExtraction({
    chatId: 100005,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data,
    messageId: 46,
  });

  updatePendingExtraction(entry.id, { data: { monto: 750 } as any });

  const fetched = getPendingExtraction(entry.id);
  assert.equal(fetched!.data.monto, 750, "monto should be updated");
  assert.equal(fetched!.data.empresa, "Disco", "empresa should be unchanged");

  deletePendingExtraction(entry.id);
});

// ---------------------------------------------------------------------------
// TTL expiry: getPendingExtraction returns null for expired sessions
// ---------------------------------------------------------------------------

test("getPendingExtraction returns null for expired session", () => {
  const data = makeData();
  const entry = createPendingExtraction({
    chatId: 100006,
    dashboardId: "dash-1",
    userId: "user-1",
    ownerUserId: "owner-1",
    data,
    messageId: 47,
  });

  // Manually set expiresAt to the past
  entry.expiresAt = Date.now() - 1;

  const result = getPendingExtraction(entry.id);
  assert.equal(result, null, "expired session should return null");

  // Also confirm getPendingExtractionByChat respects expiry
  entry.editingField = "monto"; // set it so it would be returned if not expired
  const byChat = getPendingExtractionByChat(100006);
  assert.equal(byChat, null, "expired session should not be returned by getPendingExtractionByChat");
});

// ---------------------------------------------------------------------------
// buildReviewCardText: low confidence warning appears correctly
// ---------------------------------------------------------------------------

test("buildReviewCardText includes low-confidence warning when confidence < 0.6", () => {
  const lowConf = makeData({ confidence: 0.4 });
  const text = buildReviewCardText(lowConf);
  assert.ok(text.includes("Confianza baja"), "should warn on low confidence");
  assert.ok(text.includes("Carrefour"), "should include empresa");
});

test("buildReviewCardText omits low-confidence warning when confidence >= 0.6", () => {
  const highConf = makeData({ confidence: 0.9 });
  const text = buildReviewCardText(highConf);
  assert.ok(!text.includes("Confianza baja"), "should not warn on high confidence");
});

test("buildReviewCardText handles null monto and null empresa", () => {
  const data = makeData({ monto: null, empresa: null });
  const text = buildReviewCardText(data);
  assert.ok(text.includes("Sin monto"), "should indicate missing monto");
  assert.ok(text.includes("Sin empresa"), "should indicate missing empresa");
});

// ---------------------------------------------------------------------------
// buildReviewKeyboard: shape and callback_data format
// ---------------------------------------------------------------------------

test("buildReviewKeyboard returns correct callback_data format", () => {
  const keyboard = buildReviewKeyboard("extraction-abc-123");
  const allButtons = keyboard.inline_keyboard.flat();

  const confirmBtn = allButtons.find((b) => b.callback_data === "er:confirm:extraction-abc-123");
  assert.ok(confirmBtn, "confirm button should exist");

  const cancelBtn = allButtons.find((b) => b.callback_data === "er:cancel:extraction-abc-123");
  assert.ok(cancelBtn, "cancel button should exist");

  const editMonto = allButtons.find((b) => b.callback_data === "er:edit:extraction-abc-123:monto");
  assert.ok(editMonto, "edit:monto button should exist");

  // All 6 editable fields should have buttons
  const editFields = ["monto", "empresa", "categoria", "descripcion", "tipo", "moneda"];
  for (const field of editFields) {
    const btn = allButtons.find((b) => b.callback_data === `er:edit:extraction-abc-123:${field}`);
    assert.ok(btn, `edit button for field '${field}' should exist`);
  }
});

// ---------------------------------------------------------------------------
// MediaGroupBuffer: 3 photos same group_id → 1 batch flush
// ---------------------------------------------------------------------------

test("MediaGroupBuffer flushes 3 photos from same media_group_id as single batch", async () => {
  const buf = new MediaGroupBuffer<string>({ debounceMs: 50 });
  const batches: string[][] = [];

  buf.add("group-xyz", "photo-1", (items) => batches.push(items));
  buf.add("group-xyz", "photo-2", (items) => batches.push(items));
  buf.add("group-xyz", "photo-3", (items) => batches.push(items));

  // Nothing flushed yet
  assert.equal(batches.length, 0, "should not flush before debounce");
  assert.equal(buf.size(), 1, "should track 1 group");

  // Wait for debounce
  await new Promise((r) => setTimeout(r, 120));

  assert.equal(batches.length, 1, "should flush exactly once");
  assert.deepEqual(batches[0], ["photo-1", "photo-2", "photo-3"], "all 3 photos in one batch");
  assert.equal(buf.size(), 0, "buffer should be empty after flush");
});

// ---------------------------------------------------------------------------
// extractFromPhoto HANDWRITTEN retry: already covered in telegramMedia.test.ts
// Documented skip so it's clear this was a deliberate decision.
// ---------------------------------------------------------------------------

test.skip(
  "extractFromPhoto HANDWRITTEN retry — already tested in telegramMedia.test.ts (extractFromPhoto retries with handwritten prompt on low confidence)",
  () => {
    // This scenario is fully covered by the existing test in tests/telegramMedia.test.ts.
    // Duplicating it here would be noise.
  },
);
