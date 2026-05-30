import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecurrenteRow,
  buildRecurrentesListText,
  buildRecurrenteActionKeyboard,
  canToggleRecurrente,
  RECURRENTE_PAUSE_PREFIX,
  RECURRENTE_ON_PREFIX,
} from "../src/bot/recurrentesMgmt.ts";
import type { TelegramLinkRecord } from "../src/server/telegramAccess.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLegacyLinked(ownerUserId = "owner-1"): TelegramLinkRecord {
  return {
    userId: null,
    dashboardId: null,
    ownerUserId,
    role: null,
    permissions: {},
    username: null,
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };
}

function makeDashboardLinked(dashboardId = "dash-1", userId = "user-1", role: "owner" | "editor" | "viewer" = "owner"): TelegramLinkRecord {
  return {
    userId,
    dashboardId,
    ownerUserId: userId,
    role,
    permissions: {},
    username: null,
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };
}

function makeRec(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    monto: 1500,
    tipo: "egreso",
    moneda: "ARS",
    frecuencia: "mensual",
    descripcion: "Alquiler",
    empresa_nombre: "Personal",
    is_active: true,
    deleted_at: null,
    next_run_label: "en 5 días",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildRecurrenteRow — single-line formatter
// ---------------------------------------------------------------------------

test("buildRecurrenteRow: egreso shows Gasto label", () => {
  const row = buildRecurrenteRow(makeRec({ tipo: "egreso" }));
  assert.ok(row.includes("Gasto"), `expected "Gasto" in: ${row}`);
});

test("buildRecurrenteRow: ingreso shows Ingreso label", () => {
  const row = buildRecurrenteRow(makeRec({ tipo: "ingreso" }));
  assert.ok(row.includes("Ingreso"), `expected "Ingreso" in: ${row}`);
});

test("buildRecurrenteRow: includes monto and moneda", () => {
  const row = buildRecurrenteRow(makeRec({ monto: 4500, moneda: "USD" }));
  assert.ok(row.includes("4500"), `expected monto in: ${row}`);
  assert.ok(row.includes("USD"), `expected moneda in: ${row}`);
});

test("buildRecurrenteRow: includes frecuencia", () => {
  const row = buildRecurrenteRow(makeRec({ frecuencia: "semanal" }));
  assert.ok(row.includes("semanal"), `expected frecuencia in: ${row}`);
});

test("buildRecurrenteRow: includes next_run_label", () => {
  const row = buildRecurrenteRow(makeRec({ next_run_label: "mañana" }));
  assert.ok(row.includes("mañana"), `expected label in: ${row}`);
});

test("buildRecurrenteRow: active shows activo label", () => {
  const row = buildRecurrenteRow(makeRec({ is_active: true }));
  assert.ok(row.includes("activo") || row.includes("✅"), `expected active indicator in: ${row}`);
});

test("buildRecurrenteRow: inactive shows pausado label", () => {
  const row = buildRecurrenteRow(makeRec({ is_active: false }));
  assert.ok(row.includes("pausado") || row.includes("⏸"), `expected paused indicator in: ${row}`);
});

test("buildRecurrenteRow: descripcion with Markdown special chars is escaped", () => {
  const row = buildRecurrenteRow(makeRec({ descripcion: "Netflix_Premium" }));
  // The underscore must be escaped with backslash in Markdown mode
  assert.ok(row.includes("Netflix\\_Premium") || !row.includes("Netflix_Premium"), `expected escaped value; got: ${row}`);
});

test("buildRecurrenteRow: null descripcion falls back gracefully (no crash)", () => {
  const row = buildRecurrenteRow(makeRec({ descripcion: null }));
  assert.ok(typeof row === "string");
});

// ---------------------------------------------------------------------------
// buildRecurrentesListText — full list renderer
// ---------------------------------------------------------------------------

test("buildRecurrentesListText: empty array returns friendly message", () => {
  const text = buildRecurrentesListText([]);
  assert.ok(text.length > 0);
  assert.ok(text.toLowerCase().includes("no tenés") || text.toLowerCase().includes("ningún") || text.toLowerCase().includes("no hay"));
});

test("buildRecurrentesListText: single item produces non-empty output", () => {
  const text = buildRecurrentesListText([makeRec()]);
  assert.ok(text.length > 0);
  assert.ok(text.includes("Alquiler") || text.includes("1500"));
});

test("buildRecurrentesListText: multiple items all appear", () => {
  const recs = [
    makeRec({ id: "r1", descripcion: "Alquiler" }),
    makeRec({ id: "r2", descripcion: "Netflix" }),
    makeRec({ id: "r3", descripcion: "Gym" }),
  ];
  const text = buildRecurrentesListText(recs);
  assert.ok(text.includes("Alquiler"), "missing Alquiler");
  assert.ok(text.includes("Netflix"), "missing Netflix");
  assert.ok(text.includes("Gym"), "missing Gym");
});

test("buildRecurrentesListText: result length respects Telegram 4096-char limit for moderate lists", () => {
  // 20 records with normal descriptions should fit in one message
  const recs = Array.from({ length: 20 }, (_, i) =>
    makeRec({ id: `r-${i}`, descripcion: `Recurrente ${i}` }),
  );
  const text = buildRecurrentesListText(recs);
  // Each chunk must be ≤ 4096; we test the header/list stays reasonable
  assert.ok(text.length < 4096, `text too long: ${text.length}`);
});

// ---------------------------------------------------------------------------
// buildRecurrenteActionKeyboard — per-item inline keyboard
// ---------------------------------------------------------------------------

test("RECURRENTE_PAUSE_PREFIX and RECURRENTE_ON_PREFIX are defined strings", () => {
  assert.equal(typeof RECURRENTE_PAUSE_PREFIX, "string");
  assert.equal(typeof RECURRENTE_ON_PREFIX, "string");
  assert.ok(RECURRENTE_PAUSE_PREFIX.length > 0);
  assert.ok(RECURRENTE_ON_PREFIX.length > 0);
});

test("buildRecurrenteActionKeyboard: active rec → pause button with correct callback_data", () => {
  const kb = buildRecurrenteActionKeyboard({ id: "rec-abc", is_active: true });
  const buttons = kb.inline_keyboard.flat();
  const pause = buttons.find(b => b.callback_data.startsWith(RECURRENTE_PAUSE_PREFIX));
  assert.ok(pause, "expected pause button");
  assert.equal(pause!.callback_data, `${RECURRENTE_PAUSE_PREFIX}rec-abc`);
});

test("buildRecurrenteActionKeyboard: inactive rec → activate button with correct callback_data", () => {
  const kb = buildRecurrenteActionKeyboard({ id: "rec-abc", is_active: false });
  const buttons = kb.inline_keyboard.flat();
  const activate = buttons.find(b => b.callback_data.startsWith(RECURRENTE_ON_PREFIX));
  assert.ok(activate, "expected activate button");
  assert.equal(activate!.callback_data, `${RECURRENTE_ON_PREFIX}rec-abc`);
});

test("buildRecurrenteActionKeyboard: callback_data within 64 bytes (UUID id)", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const kb = buildRecurrenteActionKeyboard({ id: uuid, is_active: true });
  const buttons = kb.inline_keyboard.flat();
  for (const btn of buttons) {
    assert.ok(btn.callback_data.length <= 64, `callback_data too long: ${btn.callback_data}`);
  }
});

test("buildRecurrenteActionKeyboard: active rec does NOT show activate button", () => {
  const kb = buildRecurrenteActionKeyboard({ id: "rec-1", is_active: true });
  const buttons = kb.inline_keyboard.flat();
  const activate = buttons.find(b => b.callback_data.startsWith(RECURRENTE_ON_PREFIX));
  assert.equal(activate, undefined, "active rec should not show activate button");
});

test("buildRecurrenteActionKeyboard: inactive rec does NOT show pause button", () => {
  const kb = buildRecurrenteActionKeyboard({ id: "rec-1", is_active: false });
  const buttons = kb.inline_keyboard.flat();
  const pause = buttons.find(b => b.callback_data.startsWith(RECURRENTE_PAUSE_PREFIX));
  assert.equal(pause, undefined, "inactive rec should not show pause button");
});

// ---------------------------------------------------------------------------
// canToggleRecurrente — scope guard
// ---------------------------------------------------------------------------

test("canToggleRecurrente: dashboard-scoped rec, matching dashboard → allowed", () => {
  const rec = { dashboard_id: "dash-1", owner_user_id: null, deleted_at: null };
  const linked = makeDashboardLinked("dash-1");
  assert.equal(canToggleRecurrente(rec, linked), true);
});

test("canToggleRecurrente: dashboard-scoped rec, different dashboard → denied", () => {
  const rec = { dashboard_id: "dash-OTHER", owner_user_id: null, deleted_at: null };
  const linked = makeDashboardLinked("dash-1");
  assert.equal(canToggleRecurrente(rec, linked), false);
});

test("canToggleRecurrente: legacy owner scope, matching owner_user_id → allowed", () => {
  const rec = { dashboard_id: null, owner_user_id: "owner-1", deleted_at: null };
  const linked = makeLegacyLinked("owner-1");
  assert.equal(canToggleRecurrente(rec, linked), true);
});

test("canToggleRecurrente: legacy owner scope, different owner_user_id → denied", () => {
  const rec = { dashboard_id: null, owner_user_id: "owner-OTHER", deleted_at: null };
  const linked = makeLegacyLinked("owner-1");
  assert.equal(canToggleRecurrente(rec, linked), false);
});

test("canToggleRecurrente: soft-deleted rec → denied regardless of scope", () => {
  const rec = { dashboard_id: "dash-1", owner_user_id: null, deleted_at: "2026-01-01T00:00:00Z" };
  const linked = makeDashboardLinked("dash-1");
  assert.equal(canToggleRecurrente(rec, linked), false);
});

test("canToggleRecurrente: null dashboard_id on rec and null dashboardId on linked → falls back to owner match", () => {
  const rec = { dashboard_id: null, owner_user_id: "owner-1", deleted_at: null };
  const linked = makeLegacyLinked("owner-1");
  assert.equal(canToggleRecurrente(rec, linked), true);
});
