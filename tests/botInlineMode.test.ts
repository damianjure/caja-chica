/**
 * Tests for bot-inline-mode feature.
 *
 * Covers:
 *   1. parseInlineQuery — pure parser: amount, currency, tipo hint, descripcion
 *   2. buildInlineResults — result articles: linked+canWrite→2 articles; viewer→none; unlinked→link prompt
 *   3. saveGate — save decision based on permission + maintenance
 */
import test from "node:test";
import assert from "node:assert/strict";

// ──────────────────────────────────────────────────────────────────────────────
// 1. parseInlineQuery — pure deterministic parser (NO Gemini)
// ──────────────────────────────────────────────────────────────────────────────
import { parseInlineQuery, type ParsedInlineQuery } from "../src/bot/inlineMode.ts";

test("parseInlineQuery: plain number extracts amount and description", () => {
  const r = parseInlineQuery("4500 luz");
  assert.equal(r.amount, 4500);
  assert.equal(r.descripcion, "luz");
  assert.equal(r.moneda, "ARS");
});

test("parseInlineQuery: number with thousands dot (4.500)", () => {
  const r = parseInlineQuery("4.500 nafta");
  assert.equal(r.amount, 4500);
  assert.equal(r.descripcion, "nafta");
});

test("parseInlineQuery: number with thousands dot multi-group (1.234.567)", () => {
  const r = parseInlineQuery("1.234.567 sueldo");
  assert.equal(r.amount, 1234567);
});

test("parseInlineQuery: decimal comma (4,5 k) — treated as 4500", () => {
  const r = parseInlineQuery("4,5k almuerzo");
  assert.equal(r.amount, 4500);
});

test("parseInlineQuery: k suffix (15k)", () => {
  const r = parseInlineQuery("15k internet");
  assert.equal(r.amount, 15000);
  assert.equal(r.descripcion, "internet");
});

test("parseInlineQuery: K uppercase suffix", () => {
  const r = parseInlineQuery("2K regalo");
  assert.equal(r.amount, 2000);
});

test("parseInlineQuery: 'una luca' → 1000", () => {
  const r = parseInlineQuery("una luca pan");
  assert.equal(r.amount, 1000);
  assert.equal(r.descripcion, "pan");
});

test("parseInlineQuery: '2 lucas' → 2000", () => {
  const r = parseInlineQuery("2 lucas alquiler");
  assert.equal(r.amount, 2000);
  assert.equal(r.descripcion, "alquiler");
});

test("parseInlineQuery: 'un palo' → 1000000", () => {
  const r = parseInlineQuery("un palo inversión");
  assert.equal(r.amount, 1_000_000);
});

test("parseInlineQuery: '3 palos' → 3000000", () => {
  const r = parseInlineQuery("3 palos deuda");
  assert.equal(r.amount, 3_000_000);
});

test("parseInlineQuery: 'una gamba' → 100", () => {
  const r = parseInlineQuery("una gamba taxi");
  assert.equal(r.amount, 100);
});

test("parseInlineQuery: '5 gambas' → 500", () => {
  const r = parseInlineQuery("5 gambas propina");
  assert.equal(r.amount, 500);
});

test("parseInlineQuery: USD hint from 'u$s' sets moneda USD", () => {
  const r = parseInlineQuery("u$s 250 dólares sueldo");
  assert.equal(r.moneda, "USD");
  assert.equal(r.amount, 250);
});

test("parseInlineQuery: USD hint from 'usd' (case-insensitive)", () => {
  const r = parseInlineQuery("500 USD fondos");
  assert.equal(r.moneda, "USD");
  assert.equal(r.amount, 500);
});

test("parseInlineQuery: 'dólares' keyword sets moneda USD", () => {
  const r = parseInlineQuery("1200 dólares honorarios");
  assert.equal(r.moneda, "USD");
  assert.equal(r.amount, 1200);
});

test("parseInlineQuery: no amount → amount null", () => {
  const r = parseInlineQuery("hola cómo estás");
  assert.equal(r.amount, null);
});

test("parseInlineQuery: empty string → amount null, descripcion empty", () => {
  const r = parseInlineQuery("");
  assert.equal(r.amount, null);
  assert.equal(r.descripcion, "");
});

test("parseInlineQuery: only amount, no description → descripcion empty", () => {
  const r = parseInlineQuery("500");
  assert.equal(r.amount, 500);
  assert.equal(r.descripcion, "");
});

test("parseInlineQuery: trimmed descripcion strips leading/trailing spaces", () => {
  const r = parseInlineQuery("1000  alquiler mensual  ");
  assert.equal(r.descripcion, "alquiler mensual");
});

test("parseInlineQuery: $ sign before number is ignored", () => {
  const r = parseInlineQuery("$3500 supermercado");
  assert.equal(r.amount, 3500);
  assert.equal(r.descripcion, "supermercado");
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. buildInlineResults — article shape + tipo encoding
// ──────────────────────────────────────────────────────────────────────────────
import { buildInlineResults, type InlineUserContext } from "../src/bot/inlineMode.ts";

const canWriteCtx: InlineUserContext = {
  linked: true,
  canWrite: true,
  deepLink: "https://t.me/bot?start=xyz",
};

const viewerCtx: InlineUserContext = {
  linked: true,
  canWrite: false,
  deepLink: "https://t.me/bot?start=xyz",
};

const unlinkedCtx: InlineUserContext = {
  linked: false,
  canWrite: false,
  deepLink: "https://t.me/bot?start=xyz",
};

const parsed: ParsedInlineQuery = { amount: 4500, moneda: "ARS", descripcion: "luz" };
const parsedNull: ParsedInlineQuery = { amount: null, moneda: "ARS", descripcion: "" };

test("buildInlineResults: linked+canWrite+amount → 2 articles (egreso, ingreso)", () => {
  const results = buildInlineResults(parsed, canWriteCtx);
  assert.equal(results.length, 2);
  const types = results.map(r => r.id.startsWith("egr:") ? "egr" : "ing");
  assert.ok(types.includes("egr"), "should have egreso result");
  assert.ok(types.includes("ing"), "should have ingreso result");
});

test("buildInlineResults: result ids encode tipo and are ≤ 64 bytes", () => {
  const results = buildInlineResults(parsed, canWriteCtx);
  for (const r of results) {
    assert.ok(r.id.length <= 64, `id "${r.id}" exceeds 64 bytes`);
    assert.ok(r.id.startsWith("egr:") || r.id.startsWith("ing:"), `unexpected id prefix: ${r.id}`);
  }
});

test("buildInlineResults: viewer → 0 save results (not allowed)", () => {
  const results = buildInlineResults(parsed, viewerCtx);
  assert.equal(results.length, 0);
});

test("buildInlineResults: unlinked → 1 article (link prompt)", () => {
  const results = buildInlineResults(parsed, unlinkedCtx);
  assert.equal(results.length, 1);
  // Must contain the deep link
  const article = results[0] as any;
  assert.ok(
    JSON.stringify(article).includes("t.me/bot"),
    "link prompt should include the bot deep link"
  );
});

test("buildInlineResults: no amount, can write → 0 save results (nothing to save)", () => {
  const results = buildInlineResults(parsedNull, canWriteCtx);
  assert.equal(results.length, 0);
});

test("buildInlineResults: articles include moneda and amount in title/description", () => {
  const results = buildInlineResults(parsed, canWriteCtx);
  const combined = results.map(r => JSON.stringify(r)).join(" ");
  assert.ok(combined.includes("4500") || combined.includes("$4500") || combined.includes("4.500"));
});

test("buildInlineResults: descripcion appears in article content", () => {
  const results = buildInlineResults(parsed, canWriteCtx);
  const combined = results.map(r => JSON.stringify(r)).join(" ");
  assert.ok(combined.includes("luz"));
});

test("buildInlineResults: cache_time ≤ 5 for user-state-dependent results", () => {
  // Results depend on per-user auth state — must not be cached long
  const results = buildInlineResults(parsed, canWriteCtx);
  for (const r of results as any[]) {
    if (r.cache_time !== undefined) {
      assert.ok(r.cache_time <= 5, `cache_time ${r.cache_time} is too high`);
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. shouldSaveInlineMovement — save gate (permission + maintenance)
// ──────────────────────────────────────────────────────────────────────────────
import { shouldSaveInlineMovement } from "../src/bot/inlineMode.ts";
import type { TelegramLinkRecord } from "../src/server/telegramAccess.ts";

const ownerLinked: TelegramLinkRecord = {
  userId: "user-1",
  dashboardId: "dash-1",
  ownerUserId: "user-1",
  role: "owner",
  permissions: {},
  username: "owner",
  remindersEnabled: true,
  linkTokenExpiresAt: null,
};

const viewerLinked: TelegramLinkRecord = {
  userId: "user-2",
  dashboardId: "dash-1",
  ownerUserId: "user-1",
  role: "viewer",
  permissions: {},
  username: "viewer",
  remindersEnabled: true,
  linkTokenExpiresAt: null,
};

const editorLinked: TelegramLinkRecord = {
  userId: "user-3",
  dashboardId: "dash-1",
  ownerUserId: "user-1",
  role: "editor",
  permissions: {},
  username: "editor",
  remindersEnabled: true,
  linkTokenExpiresAt: null,
};

test("shouldSaveInlineMovement: owner, maintenance off → allow", () => {
  assert.equal(shouldSaveInlineMovement(ownerLinked, false), true);
});

test("shouldSaveInlineMovement: editor, maintenance off → allow", () => {
  assert.equal(shouldSaveInlineMovement(editorLinked, false), true);
});

test("shouldSaveInlineMovement: viewer, maintenance off → deny", () => {
  assert.equal(shouldSaveInlineMovement(viewerLinked, false), false);
});

test("shouldSaveInlineMovement: owner, maintenance ACTIVE → deny", () => {
  assert.equal(shouldSaveInlineMovement(ownerLinked, true), false);
});

test("shouldSaveInlineMovement: editor, maintenance ACTIVE → deny", () => {
  assert.equal(shouldSaveInlineMovement(editorLinked, true), false);
});

test("shouldSaveInlineMovement: null linked → deny", () => {
  assert.equal(shouldSaveInlineMovement(null, false), false);
});

test("shouldSaveInlineMovement: null linked, maintenance active → deny", () => {
  assert.equal(shouldSaveInlineMovement(null, true), false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Legacy owner role + amount hardening (security review fixes)
// ──────────────────────────────────────────────────────────────────────────────
import {
  isInlineAmountValid,
  resolveInlineSaveAmount,
  MAX_INLINE_AMOUNT,
} from "../src/bot/inlineMode.ts";

const legacyOwnerLinked: TelegramLinkRecord = {
  userId: null,
  dashboardId: null,
  ownerUserId: "owner-legacy",
  role: null, // no dashboard_members row → resolveRoleIfNeeded returns null
  permissions: {},
  username: "legacy",
  remindersEnabled: true,
  linkTokenExpiresAt: null,
};

test("shouldSaveInlineMovement: legacy owner (role=null, ownerUserId set) → allow", () => {
  // Regression: null role must map to owner when ownerUserId is set, not silently to viewer.
  assert.equal(shouldSaveInlineMovement(legacyOwnerLinked, false), true);
});

test("shouldSaveInlineMovement: legacy owner during maintenance → deny", () => {
  assert.equal(shouldSaveInlineMovement(legacyOwnerLinked, true), false);
});

test("isInlineAmountValid: rejects null, zero, negative, non-finite, over-max", () => {
  assert.equal(isInlineAmountValid(null), false);
  assert.equal(isInlineAmountValid(0), false);
  assert.equal(isInlineAmountValid(-5), false);
  assert.equal(isInlineAmountValid(Number.POSITIVE_INFINITY), false);
  assert.equal(isInlineAmountValid(Number.NaN), false);
  assert.equal(isInlineAmountValid(MAX_INLINE_AMOUNT + 1), false);
});

test("isInlineAmountValid: accepts normal + boundary amounts", () => {
  assert.equal(isInlineAmountValid(4500), true);
  assert.equal(isInlineAmountValid(MAX_INLINE_AMOUNT), true);
});

test("resolveInlineSaveAmount: returns re-parsed amount when it matches result_id", () => {
  assert.equal(resolveInlineSaveAmount(4500, 4500), 4500);
});

test("resolveInlineSaveAmount: discards on mismatch (result_id tampering)", () => {
  // A crafted result_id amount that diverges from the re-parsed query is rejected.
  assert.equal(resolveInlineSaveAmount(4500, 999999), null);
});

test("resolveInlineSaveAmount: null when no parsed amount", () => {
  assert.equal(resolveInlineSaveAmount(null, 4500), null);
});

test("resolveInlineSaveAmount: null when out of bounds even if both agree", () => {
  assert.equal(resolveInlineSaveAmount(MAX_INLINE_AMOUNT + 10, MAX_INLINE_AMOUNT + 10), null);
});

test("resolveInlineSaveAmount: 1-unit rounding drift is tolerated", () => {
  assert.equal(resolveInlineSaveAmount(4500, 4501), 4500);
});
