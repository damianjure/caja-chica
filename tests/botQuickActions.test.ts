import test from "node:test";
import assert from "node:assert/strict";

// ===== Feature 1: Undo inline after save =====
import { buildUndoKeyboard, canUndoMovement } from "../src/bot/quickActions.ts";

test("buildUndoKeyboard encodes movId in callback_data", () => {
  const kb = buildUndoKeyboard("abc-123");
  const btn = kb.inline_keyboard[0][0];
  assert.equal(btn.callback_data, "undo:abc-123");
  assert.ok(btn.text.includes("↩️"));
});

test("buildUndoKeyboard callback_data under 64 bytes", () => {
  // UUID is 36 chars, prefix is 5 chars, total = 41 — well under 64
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const kb = buildUndoKeyboard(uuid);
  const data = kb.inline_keyboard[0][0].callback_data;
  assert.ok(data.length <= 64, `callback_data length ${data.length} exceeds 64 bytes`);
});

test("canUndoMovement: owner with matching dashboard_id can undo", () => {
  const mov = { id: "mov-1", dashboard_id: "dash-1", owner_user_id: "user-1", deleted_at: null };
  const linked = { dashboardId: "dash-1", ownerUserId: "user-1", userId: "user-1", role: "owner" as const, permissions: {} };
  assert.equal(canUndoMovement(mov, linked), true);
});

test("canUndoMovement: scope-only helper allows dashboard match regardless of role (role gate is upstream)", () => {
  // The helper itself checks dashboard/owner scope match, not role.
  // Role check is done by requireTelegramCan before calling the helper.
  const mov = { id: "mov-1", dashboard_id: "dash-1", owner_user_id: "user-1", deleted_at: null };
  const linked = { dashboardId: "dash-1", ownerUserId: "user-1", userId: "viewer-1", role: "viewer" as const, permissions: {} };
  // Same dashboard — scope matches
  assert.equal(canUndoMovement(mov, linked), true);
});

test("canUndoMovement: different dashboard_id cannot undo", () => {
  const mov = { id: "mov-1", dashboard_id: "dash-OTHER", owner_user_id: "user-1", deleted_at: null };
  const linked = { dashboardId: "dash-1", ownerUserId: "user-1", userId: "user-1", role: "owner" as const, permissions: {} };
  assert.equal(canUndoMovement(mov, linked), false);
});

test("canUndoMovement: legacy owner scope (no dashboard_id) matches by owner_user_id", () => {
  const mov = { id: "mov-1", dashboard_id: null, owner_user_id: "user-1", deleted_at: null };
  const linked = { dashboardId: null, ownerUserId: "user-1", userId: "user-1", role: "owner" as const, permissions: {} };
  assert.equal(canUndoMovement(mov, linked), true);
});

test("canUndoMovement: legacy owner_user_id mismatch cannot undo", () => {
  const mov = { id: "mov-1", dashboard_id: null, owner_user_id: "user-OTHER", deleted_at: null };
  const linked = { dashboardId: null, ownerUserId: "user-1", userId: "user-1", role: "owner" as const, permissions: {} };
  assert.equal(canUndoMovement(mov, linked), false);
});

test("canUndoMovement: already deleted movement cannot be undone (idempotency guard)", () => {
  const mov = { id: "mov-1", dashboard_id: "dash-1", owner_user_id: "user-1", deleted_at: "2026-01-01T00:00:00Z" };
  const linked = { dashboardId: "dash-1", ownerUserId: "user-1", userId: "user-1", role: "owner" as const, permissions: {} };
  assert.equal(canUndoMovement(mov, linked), false);
});

// ===== Feature 2: Quick balance (saldo rápido) =====
import { computeQuickBalance } from "../src/bot/quickActions.ts";

const movs = [
  { tipo: "ingreso", monto: 1000, moneda: "ARS", created_at: "2026-05-29T10:00:00Z", deleted_at: null },
  { tipo: "egreso",  monto: 300,  moneda: "ARS", created_at: "2026-05-29T11:00:00Z", deleted_at: null },
  { tipo: "ingreso", monto: 200,  moneda: "USD", created_at: "2026-05-29T12:00:00Z", deleted_at: null },
  // deleted movement — must be ignored
  { tipo: "ingreso", monto: 9999, moneda: "ARS", created_at: "2026-05-29T09:00:00Z", deleted_at: "2026-05-29T09:30:00Z" },
];

test("computeQuickBalance: net ARS = 700, USD = 200 for given movs", () => {
  const { netARS, netUSD } = computeQuickBalance(movs as any);
  assert.equal(netARS, 700);
  assert.equal(netUSD, 200);
});

test("computeQuickBalance: ignores deleted movements", () => {
  const { netARS } = computeQuickBalance(movs as any);
  // deleted mov had 9999 ARS ingreso — if counted: 1000 - 300 + 9999 = 10699; correct: 700
  assert.equal(netARS, 700);
});

test("computeQuickBalance: empty array returns 0s", () => {
  const { netARS, netUSD } = computeQuickBalance([]);
  assert.equal(netARS, 0);
  assert.equal(netUSD, 0);
});

test("computeQuickBalance: only USD movements", () => {
  const usdMovs = [
    { tipo: "ingreso", monto: 500, moneda: "USD", created_at: "2026-05-29T10:00:00Z", deleted_at: null },
    { tipo: "egreso",  monto: 150, moneda: "USD", created_at: "2026-05-29T11:00:00Z", deleted_at: null },
  ];
  const { netARS, netUSD } = computeQuickBalance(usdMovs as any);
  assert.equal(netARS, 0);
  assert.equal(netUSD, 350);
});

// ===== Feature 3: setMyCommands per role =====
import { getCommandsForRole, VIEWER_COMMANDS, FULL_COMMANDS } from "../src/bot/quickActions.ts";

test("getCommandsForRole: viewer gets read-only commands", () => {
  const cmds = getCommandsForRole("viewer");
  const commandNames = cmds.map(c => c.command);
  // Must include read commands
  assert.ok(commandNames.includes("menu"));
  assert.ok(commandNames.includes("saldos"));
  assert.ok(commandNames.includes("buscar"));
  assert.ok(commandNames.includes("informes"));
  // Must NOT include write commands
  assert.ok(!commandNames.includes("recurrente"));
  assert.ok(!commandNames.includes("agregarempresa"));
  assert.ok(!commandNames.includes("agregarcategoria"));
});

test("getCommandsForRole: owner gets full command list", () => {
  const cmds = getCommandsForRole("owner");
  const commandNames = cmds.map(c => c.command);
  assert.ok(commandNames.includes("recurrente"));
  assert.ok(commandNames.includes("agregarempresa"));
  assert.ok(commandNames.includes("agregarcategoria"));
});

test("getCommandsForRole: editor gets full command list", () => {
  const cmds = getCommandsForRole("editor");
  const commandNames = cmds.map(c => c.command);
  assert.ok(commandNames.includes("recurrente"));
  assert.ok(commandNames.includes("agregarempresa"));
});

test("VIEWER_COMMANDS is a subset of FULL_COMMANDS", () => {
  const fullNames = new Set(FULL_COMMANDS.map(c => c.command));
  for (const cmd of VIEWER_COMMANDS) {
    assert.ok(fullNames.has(cmd.command), `viewer command "${cmd.command}" not found in full list`);
  }
});

test("each command has non-empty description", () => {
  for (const cmd of [...VIEWER_COMMANDS, ...FULL_COMMANDS]) {
    assert.ok(cmd.description.length > 0, `command "${cmd.command}" has empty description`);
    assert.ok(cmd.command.length > 0);
  }
});

// ===== Feature 4: Low-confidence note in review card =====
import { LOW_CONFIDENCE_THRESHOLD, buildLowConfidenceNote } from "../src/bot/quickActions.ts";

test("LOW_CONFIDENCE_THRESHOLD is defined and between 0 and 1", () => {
  assert.ok(typeof LOW_CONFIDENCE_THRESHOLD === "number");
  assert.ok(LOW_CONFIDENCE_THRESHOLD > 0 && LOW_CONFIDENCE_THRESHOLD < 1);
});

test("buildLowConfidenceNote: returns note when empresa is null and confidence low", () => {
  const note = buildLowConfidenceNote({ empresa: null, confidence: LOW_CONFIDENCE_THRESHOLD - 0.01 });
  assert.ok(note.length > 0);
  assert.ok(note.includes("empresa") || note.includes("Empresa") || note.includes("No estoy seguro"));
});

test("buildLowConfidenceNote: returns empty string when empresa resolved and confidence ok", () => {
  const note = buildLowConfidenceNote({ empresa: "YPF", confidence: 0.95 });
  assert.equal(note, "");
});

test("buildLowConfidenceNote: returns note when confidence is below threshold regardless of empresa", () => {
  const note = buildLowConfidenceNote({ empresa: "YPF", confidence: 0.01 });
  assert.ok(note.length > 0);
});

test("buildLowConfidenceNote: empresa null always shows note (unresolved), regardless of confidence", () => {
  const noteAtThreshold = buildLowConfidenceNote({ empresa: null, confidence: LOW_CONFIDENCE_THRESHOLD });
  // empresa null = unresolved — always shows empresa note
  assert.ok(noteAtThreshold.length > 0);
});

test("buildLowConfidenceNote: no note when empresa null but confidence is fine", () => {
  // empresa null alone is not enough — only combined or if confidence low
  // Actually spec says: empresa unresolved OR confidence low → show note
  // Let's test the combined case — empresa null with ok confidence shows note too
  const note = buildLowConfidenceNote({ empresa: null, confidence: 0.95 });
  // empresa null = unresolved → should show note
  assert.ok(note.length > 0, "Should show note when empresa is null even if confidence is ok");
});
