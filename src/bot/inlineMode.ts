/**
 * inlineMode.ts — Stateless Telegram inline mode for @bot <query>.
 *
 * STATELESS INVARIANT: No in-memory Maps, no session state.
 * All context is re-derived on every inline_query and chosen_inline_result.
 * This is safe for Cloud Run max-instances=1 (decision #18) and would remain
 * safe even if max-instances were raised, since nothing is held in process memory.
 *
 * Flow:
 *   1. User types "@BotUsername 4500 luz" in any chat
 *   2. bot.on("inline_query") fires → resolve user, parse query, return articles
 *   3. User picks an article → bot.on("chosen_inline_result") fires
 *   4. Re-parse query from chosen_inline_result.query, re-resolve user, persist
 *
 * NO Gemini: inline fires on every keystroke — Gemini would be rate-limited
 * and too expensive. A deterministic parser handles rioplatense amounts.
 */

import type { Bot } from "grammy";
import type { InlineQueryResult } from "@grammyjs/types";
import type { BotDeps } from "./deps.ts";
import type { TelegramLinkRecord } from "../server/telegramAccess.ts";
import { resolveTelegramIdentityByChatId } from "../server/telegramAccess.ts";
import { can } from "../server/permissions.ts";
import { isWriteBlocked } from "../server/maintenance.ts";
import { persistTelegramMovement } from "./commands/movements.ts";
import { escapeMd } from "./utils.ts";

// ---------------------------------------------------------------------------
// 1. Pure amount parser
// ---------------------------------------------------------------------------

export interface ParsedInlineQuery {
  amount: number | null;
  moneda: "ARS" | "USD";
  descripcion: string;
}

/**
 * Pure deterministic parser. Supports:
 *   - Plain integers: "4500 luz"
 *   - Thousands-dot notation: "4.500 nafta", "1.234.567 sueldo"
 *   - k/K suffix: "15k internet", "4,5k almuerzo"
 *   - Rioplatense slang: "una/un luca/lucas", "un/una palo/palos", "una/un gamba/gambas"
 *   - $ sign prefix (ignored)
 *   - USD hint: "u$s", "usd", "USD", "dólares", "dolares"
 *   - Remaining text after amount tokens → descripcion
 */
export function parseInlineQuery(raw: string): ParsedInlineQuery {
  const text = raw.trim();

  // Detect currency
  const moneda = detectCurrency(text) ? "USD" : "ARS";

  // Strip currency markers for amount parsing
  const stripped = text
    .replace(/u\$s/gi, "")
    .replace(/\busd\b/gi, "")
    .replace(/\bdólares?\b/gi, "")
    .replace(/\bdolares?\b/gi, "")
    .trim();

  // Try slang first
  const slangResult = parseSlang(stripped);
  if (slangResult !== null) {
    return { amount: slangResult.amount, moneda, descripcion: slangResult.rest };
  }

  // Try numeric pattern
  const numResult = parseNumericAmount(stripped);
  if (numResult !== null) {
    return { amount: numResult.amount, moneda, descripcion: numResult.rest };
  }

  return { amount: null, moneda, descripcion: text };
}

function detectCurrency(text: string): boolean {
  return /u\$s|\busd\b|dólares?|dolares?/i.test(text);
}

/** Matches: "una luca", "2 lucas", "un palo", "3 palos", "una gamba", "5 gambas" */
function parseSlang(text: string): { amount: number; rest: string } | null {
  // Longer alternatives first to avoid partial match (lucas before luca, etc.)
  const slangPattern =
    /^(una?|[\d,\.]+)\s+(lucas|luca|palos|palo|gambas|gamba)\s*(.*)/i;
  const m = text.match(slangPattern);
  if (!m) return null;

  const rawQty = m[1].toLowerCase();
  const unit = m[2].toLowerCase();
  const rest = (m[3] ?? "").trim();

  let qty: number;
  if (rawQty === "un" || rawQty === "una") {
    qty = 1;
  } else {
    qty = parseLocaleNumber(rawQty);
    if (!Number.isFinite(qty)) return null;
  }

  const multiplier =
    unit === "luca" || unit === "lucas"
      ? 1_000
      : unit === "palo" || unit === "palos"
        ? 1_000_000
        : 100; // gamba/gambas

  return { amount: qty * multiplier, rest };
}

/** Matches leading $ + numeric, with optional k/K suffix. */
function parseNumericAmount(text: string): { amount: number; rest: string } | null {
  // Pattern: optional $, then number (with dot/comma grouping), optional k, rest
  const numPattern = /^\$?\s*([\d.,]+)\s*([kK])?\s*(.*)/;
  const m = text.match(numPattern);
  if (!m) return null;

  let num = parseLocaleNumber(m[1]);
  if (!Number.isFinite(num) || num === 0) return null;

  const kSuffix = m[2];
  const rest = (m[3] ?? "").trim();

  if (kSuffix) num *= 1_000;

  return { amount: num, rest };
}

/**
 * Parse "4.500" → 4500, "4,5" → 4.5, "1.234.567" → 1234567.
 * Heuristic: if last separator is "." and there are ≤3 digits after it → decimal;
 * otherwise treat dots as thousand separators.
 */
function parseLocaleNumber(s: string): number {
  // All commas → candidate decimal separator or thousand sep
  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;

  if (dotCount === 0 && commaCount === 0) return parseFloat(s);

  // "4,5" → decimal comma; "4,500" → thousand comma
  if (commaCount === 1 && dotCount === 0) {
    const parts = s.split(",");
    if (parts[1].length <= 2) {
      // decimal
      return parseFloat(s.replace(",", "."));
    }
    // thousand separator
    return parseFloat(s.replace(",", ""));
  }

  // "4.500" → if last dot has ≤3 digits after → dot is thousand sep
  if (dotCount >= 1 && commaCount === 0) {
    const parts = s.split(".");
    const lastPart = parts[parts.length - 1];
    if (parts.length > 1 && lastPart.length === 3) {
      // All dots are thousand separators
      return parseFloat(s.replace(/\./g, ""));
    }
    // Single dot as decimal separator: "4.5"
    return parseFloat(s);
  }

  // Mixed: "1.234,56" → comma is decimal
  if (commaCount === 1 && dotCount >= 1) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }

  return parseFloat(s.replace(/[^0-9.]/g, ""));
}

// ---------------------------------------------------------------------------
// 2. Amount validation + authoritative resolution
// ---------------------------------------------------------------------------

/** Sane upper bound for an inline-logged amount (defense against crafted/huge values). */
export const MAX_INLINE_AMOUNT = 100_000_000_000; // 1e11

/** True only for a finite, positive amount within the sane bound. */
export function isInlineAmountValid(amount: number | null): amount is number {
  return amount !== null && Number.isFinite(amount) && amount > 0 && amount <= MAX_INLINE_AMOUNT;
}

/**
 * Resolve the authoritative amount for an inline SAVE.
 *
 * The amount comes from the RE-PARSED query, NOT from result_id: Telegram echoes
 * result_id back verbatim without integrity checks, so a crafted/replayed
 * chosen_inline_result could carry an arbitrary amount there. result_id's amount is
 * only used as a cross-check; if it diverges from the re-parsed query, we discard.
 * Returns null when there is no amount, it is out of bounds, or the two disagree.
 */
export function resolveInlineSaveAmount(parsedAmount: number | null, decodedAmount: number): number | null {
  if (!isInlineAmountValid(parsedAmount)) return null;
  if (Math.abs(parsedAmount - decodedAmount) > 1) return null;
  return parsedAmount;
}

// ---------------------------------------------------------------------------
// 3. Result builder
// ---------------------------------------------------------------------------

export interface InlineUserContext {
  linked: boolean;
  canWrite: boolean;
  deepLink: string;
}

/**
 * Build the array of InlineQueryResult articles.
 *
 * - Unlinked → 1 article: link prompt (no save action)
 * - Viewer (canWrite=false) → 0 articles
 * - No amount → 0 save articles
 * - Can write + amount → 2 articles: egreso + ingreso
 */
export function buildInlineResults(
  parsed: ParsedInlineQuery,
  ctx: InlineUserContext,
): InlineQueryResult[] {
  if (!ctx.linked) {
    return [buildLinkPromptArticle(ctx.deepLink)];
  }

  if (!ctx.canWrite || !isInlineAmountValid(parsed.amount)) {
    return [];
  }

  const amount = parsed.amount; // narrowed to number by isInlineAmountValid above
  const { moneda, descripcion } = parsed;
  const formattedAmount = formatAmount(amount, moneda);
  const desc = descripcion || "(sin descripción)";
  const descMd = escapeMd(desc); // user text → escape before Markdown render

  const egresoArticle: InlineQueryResult = {
    type: "article",
    id: encodeResultId("egr", amount, moneda),
    title: `💸 Gasto ${formattedAmount} — ${desc}`,
    description: `Registrar como gasto en ${moneda}`,
    input_message_content: {
      message_text: `💸 *Gasto registrado:* ${descMd}\n💰 ${formattedAmount}`,
      parse_mode: "Markdown",
    },
    cache_time: 1,
  } as unknown as InlineQueryResult;

  const ingresoArticle: InlineQueryResult = {
    type: "article",
    id: encodeResultId("ing", amount, moneda),
    title: `💚 Ingreso ${formattedAmount} — ${desc}`,
    description: `Registrar como ingreso en ${moneda}`,
    input_message_content: {
      message_text: `💚 *Ingreso registrado:* ${descMd}\n💰 ${formattedAmount}`,
      parse_mode: "Markdown",
    },
    cache_time: 1,
  } as unknown as InlineQueryResult;

  return [egresoArticle, ingresoArticle];
}

/** Encode tipo into result id. Format: "egr:<amount>:<moneda>" or "ing:<amount>:<moneda>" */
function encodeResultId(tipo: "egr" | "ing", amount: number, moneda: "ARS" | "USD"): string {
  // Max 64 bytes; "egr:1234567:USD" = 15 chars — well within budget
  return `${tipo}:${Math.round(amount)}:${moneda}`;
}

/** Decode tipo from result id. Returns null if unrecognized. */
export function decodeResultId(id: string): { tipo: "ingreso" | "egreso"; amount: number; moneda: "ARS" | "USD" } | null {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [tipoCode, amountStr, monedaStr] = parts;
  const tipo = tipoCode === "egr" ? "egreso" : tipoCode === "ing" ? "ingreso" : null;
  if (!tipo) return null;
  const amount = parseFloat(amountStr);
  if (!Number.isFinite(amount)) return null;
  const moneda = monedaStr === "USD" ? "USD" : "ARS";
  return { tipo, amount, moneda };
}

function formatAmount(amount: number, moneda: "ARS" | "USD"): string {
  const prefix = moneda === "USD" ? "u$s" : "$";
  return `${prefix}${amount.toLocaleString("es-AR")}`;
}

function buildLinkPromptArticle(deepLink: string): InlineQueryResult {
  return {
    type: "article",
    id: "unlinked:prompt",
    title: "🔒 Primero vinculá tu cuenta",
    description: "Tu cuenta de Telegram no está vinculada a Caja Chica todavía",
    input_message_content: {
      message_text: `🔒 Para usar el modo inline primero tenés que vincular tu Telegram.\n\nAbrí este link desde tu chat privado con el bot: ${deepLink}`,
    },
    cache_time: 10,
  } as unknown as InlineQueryResult;
}

// ---------------------------------------------------------------------------
// 3. Save gate
// ---------------------------------------------------------------------------

/**
 * Pure decision function: should we persist this inline movement?
 * Checks permission + maintenance. Does NOT do I/O.
 */
export function shouldSaveInlineMovement(
  linked: TelegramLinkRecord | null,
  maintenanceActive: boolean,
): boolean {
  if (!linked) return false;
  if (maintenanceActive) return false;

  // Legacy owners (pre-dashboard migration) have no dashboard_members row, so
  // resolveRoleIfNeeded returns role=null while ownerUserId is set. Treat that as
  // "owner" (they own their data) — otherwise a legitimate owner is silently blocked.
  const effectiveRole = linked.role ?? (linked.ownerUserId ? "owner" : "viewer");
  const memberCtx = {
    role: effectiveRole,
    permissions: linked.permissions ?? {},
    user_id: linked.userId ?? linked.ownerUserId ?? "",
  };

  return can(memberCtx, "write_movimiento");
}

// ---------------------------------------------------------------------------
// 4. Bot handler wiring
// ---------------------------------------------------------------------------

export function registerInlineModeHandlers(bot: Bot, deps: BotDeps): void {
  const { supabase, dashboardUrl } = deps;

  bot.on("inline_query", async (ctx) => {
    const telegramUserId = ctx.inlineQuery.from.id;
    const queryText = ctx.inlineQuery.query.trim();
    const deepLink = `${dashboardUrl}`;

    // Resolve linked account (stateless DB lookup)
    const linked = await resolveTelegramIdentityByChatId(supabase, telegramUserId).catch(() => null);
    const isLinked = Boolean(linked?.userId || linked?.ownerUserId);
    const canWrite = isLinked && shouldSaveInlineMovement(linked, isWriteBlocked());

    const parsed = parseInlineQuery(queryText);

    const userCtx: InlineUserContext = {
      linked: isLinked,
      canWrite,
      deepLink,
    };

    const results = buildInlineResults(parsed, userCtx);

    await ctx.answerInlineQuery(results as any, {
      cache_time: 1,
      is_personal: true,
    });
  });

  bot.on("chosen_inline_result", async (ctx) => {
    const resultId = ctx.chosenInlineResult.result_id;
    const queryText = ctx.chosenInlineResult.query;
    const telegramUserId = ctx.chosenInlineResult.from.id;

    // Decode tipo from result_id (stateless — no Maps needed)
    const decoded = decodeResultId(resultId);
    if (!decoded) return; // unlinked prompt or unknown id — no save

    // Re-resolve user identity (stateless). inline `from.id` is the Telegram USER id;
    // in private chats it equals the chat_id the legacy `usuarios` table stores, and
    // resolveViaNewLinks keys on telegram_user_id — so both link paths resolve correctly.
    const linked = await resolveTelegramIdentityByChatId(supabase, telegramUserId).catch(() => null);

    // Re-check gates (permission + maintenance) on the SAVE path — not inherited from inline_query.
    if (!shouldSaveInlineMovement(linked, isWriteBlocked())) return;

    // Re-parse query for the authoritative monto + moneda + descripcion. result_id is
    // echoed verbatim by Telegram (no integrity guarantee), so its amount is only a
    // cross-check (resolveInlineSaveAmount discards on mismatch); tipo is the one field
    // that legitimately comes from the article the user chose.
    const parsed = parseInlineQuery(queryText);
    const amount = resolveInlineSaveAmount(parsed.amount, decoded.amount);
    if (amount === null) return;

    const item = {
      monto: amount,
      tipo: decoded.tipo,
      moneda: parsed.moneda,
      categoria: "Otros",
      empresa: null,
      descripcion: parsed.descripcion || queryText,
    };

    try {
      await persistTelegramMovement(supabase, {
        linked: linked!,
        item,
        originalText: queryText,
      });
    } catch (err) {
      // chosen_inline_result has no reply channel — log only
      console.error("[inline] persistTelegramMovement failed:", err);
    }
  });
}
