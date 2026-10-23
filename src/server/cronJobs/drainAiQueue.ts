import {
  getAllPendingItems,
  markItemProcessed,
  markItemFailed,
  markItemsSeen,
  incrementRetry,
  expirePendingItems,
  purgeFinishedItems,
  type AiQueueItem,
} from "../aiQueue.ts";
import { alertSuperadmin } from "../alertSuperadmin.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "../gemini.ts";
import { geminiGenerateText, GeminiUnavailableError } from "../geminiWithFallback.ts";
import { applyTelegramDataScope, resolveDashboardRole } from "../telegramAccess.ts";
import { persistTelegramMovement, persistTelegramTicket } from "../../bot/commands/movements.ts";
import { extractReceiptWithItems } from "../telegramMedia.ts";
import type { GenAILike, SupabaseLike } from "../contracts.ts";
import type { TelegramLinkRecord } from "../telegramAccess.ts";

type BotLike = {
  api: {
    getFile(fileId: string): Promise<{ file_path?: string }>;
    sendMessage(chatId: number, text: string, opts?: unknown): Promise<unknown>;
  };
} | null;

export interface DrainAiQueueDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
  genAI2: GenAILike | null;
  bot: BotLike;
  botToken: string | undefined;
}

export interface DrainResult {
  processed: number;
  failed: number;
  expired: number;
  stopped: boolean;
  /** True when another drain was already running and this call did nothing. */
  busy?: boolean;
}

function linkedFromItem(item: AiQueueItem): TelegramLinkRecord {
  return {
    dashboardId: item.dashboard_id,
    ownerUserId: item.owner_user_id,
    userId: item.owner_user_id,
    role: null,
    permissions: {},
    username: null,
    remindersEnabled: false,
    linkTokenExpiresAt: null,
  };
}

async function getCategories(supabase: SupabaseLike, linked: TelegramLinkRecord): Promise<string> {
  try {
    const { data } = await applyTelegramDataScope(
      (supabase as any).from("categorias").select("nombre"),
      linked,
    );
    return (data ?? []).map((c: any) => c.nombre).join(", ") || "Otros";
  } catch {
    return "Otros";
  }
}

async function processTextItem(
  deps: DrainAiQueueDeps,
  item: AiQueueItem,
): Promise<{ ok: boolean; description?: string; tipo?: string }> {
  const linked = linkedFromItem(item);
  const catList = await getCategories(deps.supabase, linked);
  const text = item.text_content ?? "";

  const result = await geminiGenerateText(deps.genAI, deps.genAI2 as any, {
    model: "gemini-2.5-flash-lite",
    contents: `Extraé los datos de este mensaje: "${text}"`,
    config: {
      systemInstruction:
        SYSTEM_PROMPT +
        `\nHOY ES ${new Date().toISOString().slice(0, 10)}.` +
        `\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja, usá "Otros".`,
    },
  });

  const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const extracted = parseGeminiJsonResponse(textResponse);
  if (!extracted || !Array.isArray(extracted.items) || extracted.items.length === 0) {
    return { ok: false };
  }

  const rawItem = extracted.items[0] as any;
  const { created } = await persistTelegramMovement(deps.supabase as any, {
    linked,
    item: {
      monto: rawItem.monto,
      tipo: rawItem.tipo === "ingreso" ? "ingreso" : "egreso",
      moneda: rawItem.moneda === "USD" ? "USD" : "ARS",
      categoria: rawItem.categoria || "Otros",
      empresa: rawItem.empresa || null,
      descripcion: rawItem.descripcion || text.slice(0, 120),
    },
    originalText: text,
  });

  return { ok: !!created?.id, description: rawItem.descripcion || text.slice(0, 60), tipo: rawItem.tipo };
}

async function processMediaItem(
  deps: DrainAiQueueDeps,
  item: AiQueueItem,
): Promise<{ ok: boolean; description?: string }> {
  if (!deps.bot || !deps.botToken) return { ok: false };
  const fileId = item.file_ids?.[0];
  if (!fileId) return { ok: false };

  const tgFile = await deps.bot.api.getFile(fileId);
  if (!tgFile.file_path) return { ok: false };

  const mimeType = item.mime_types?.[0] ?? "image/jpeg";
  const linked = linkedFromItem(item);

  const { result } = await extractReceiptWithItems({
    genAI: deps.genAI as any,
    genAI2: deps.genAI2 as any,
    botToken: deps.botToken,
    filePath: tgFile.file_path,
    mimeType,
  });

  const payable = result.items.filter((it) => it.monto !== null);
  if (payable.length >= 1) {
    const saved = await persistTelegramTicket(deps.supabase as any, {
      linked,
      meta: result,
      sourceType: item.kind === "pdf" ? "pdf" : "photo",
    });
    if (saved) {
      return { ok: true, description: saved.merchant };
    }
  }

  const { created } = await persistTelegramMovement(deps.supabase as any, {
    linked,
    item: {
      monto: result.total,
      tipo: "egreso",
      moneda: result.moneda,
      categoria: "Varios",
      empresa: null,
      descripcion: result.empresa?.trim() || "Gasto desde foto",
    },
    originalText: `[${item.kind}] ${result.empresa ?? "ticket"}`,
  });
  return { ok: !!created?.id, description: result.empresa?.trim() || "ticket" };
}

async function processWebTextItem(
  deps: DrainAiQueueDeps,
  item: AiQueueItem,
): Promise<{ ok: boolean; description?: string; tipo?: string; count?: number }> {
  const linked = linkedFromItem(item);
  const catList = await getCategories(deps.supabase, linked);
  const text = item.text_content ?? "";

  const result = await geminiGenerateText(deps.genAI, deps.genAI2 as any, {
    model: "gemini-2.5-flash-lite",
    contents: `Extraé los datos de este mensaje: "${text}"`,
    config: {
      systemInstruction:
        SYSTEM_PROMPT +
        `\nHOY ES ${new Date().toISOString().slice(0, 10)}.` +
        `\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja, usá "Otros".`,
    },
  });

  const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const extracted = parseGeminiJsonResponse(textResponse);
  if (!extracted || !Array.isArray(extracted.items) || extracted.items.length === 0) {
    return { ok: false };
  }

  const ownership: Record<string, string> = {};
  if (item.dashboard_id) ownership.dashboard_id = item.dashboard_id;
  if (item.owner_user_id) ownership.owner_user_id = item.owner_user_id;
  const rows = (extracted.items as any[]).map((rawItem) => ({
    ...ownership,
    tipo: rawItem.tipo === "ingreso" ? "ingreso" : "egreso",
    moneda: rawItem.moneda === "USD" ? "USD" : "ARS",
    monto: Math.abs(rawItem.monto || 0),
    categoria: rawItem.categoria || "Otros",
    empresa_nombre: rawItem.empresa || "Personal",
    descripcion: rawItem.descripcion || text.slice(0, 120),
    original_text: text,
    source: "web",
    conciliado: true,
  }));

  // One insert for all rows: either every movement is saved or none is, so a
  // retry never duplicates part of the message.
  const { error } = await (deps.supabase as any).from("movimientos").insert(rows);
  if (error) {
    console.error(`[drainAiQueue] insert failed for item ${item.id}:`, error);
    return { ok: false };
  }

  return { ok: true, description: rows.map((r) => r.descripcion).join(", ").slice(0, 120), tipo: rows[0].tipo, count: rows.length };
}

/**
 * Re-checks, at drain time, that the author can still write to the item's
 * dashboard: a role change or removal after queueing must not let the item
 * through. Items without a dashboard belong to legacy single-owner accounts.
 */
async function authorCanWrite(deps: DrainAiQueueDeps, item: AiQueueItem): Promise<boolean> {
  if (!item.dashboard_id) return !!item.owner_user_id;
  if (!item.owner_user_id) return false;
  const role = await resolveDashboardRole(deps.supabase as any, item.owner_user_id, item.dashboard_id);
  return role === "owner" || role === "editor";
}

/** Escapes Telegram legacy-Markdown control characters in user text. */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1");
}

function quoteForChat(item: AiQueueItem): string {
  const text = item.text_content?.trim();
  if (text) return `“${escapeMarkdown(text.slice(0, 80))}”`;
  return item.kind === "pdf" ? "un PDF" : item.kind === "album" ? "un álbum de fotos" : "una foto";
}

interface ChatSummary {
  saved: string[];
  failed: string[];
  ids: string[];
}

function chatSummary(summaries: Map<number, ChatSummary>, chatId: number): ChatSummary {
  const existing = summaries.get(chatId);
  if (existing) return existing;
  const created: ChatSummary = { saved: [], failed: [], ids: [] };
  summaries.set(chatId, created);
  return created;
}

function buildChatSummaryText(summary: ChatSummary): string {
  const parts: string[] = [];
  if (summary.saved.length > 0) {
    const n = summary.saved.length;
    const list = summary.saved.slice(0, 10).join("\n");
    const more = n > 10 ? `\n_… y ${n - 10} más_` : "";
    parts.push(
      `✅ *La IA está disponible de nuevo.*\n` +
        `Se guardaron ${n} mensaje${n !== 1 ? "s" : ""} que tenías pendiente${n !== 1 ? "s" : ""}:\n\n${list}${more}`,
    );
  }
  if (summary.failed.length > 0) {
    const n = summary.failed.length;
    const list = summary.failed.slice(0, 10).map((line) => `• ${line}`).join("\n");
    const more = n > 10 ? `\n_… y ${n - 10} más_` : "";
    parts.push(
      `⚠️ No pude procesar ${n} mensaje${n !== 1 ? "s" : ""}. Mandal${n !== 1 ? "os" : "o"} de nuevo:\n\n${list}${more}`,
    );
  }
  return parts.join("\n\n");
}

// In-process lock. The cron (every 5 min) and the superadmin "Procesar ahora"
// button can overlap; without it both runs read the same items and save each
// movement twice. Enough because of the single-instance invariant
// (Cloud Run max-instances=1).
let drainInFlight = false;

export async function runDrainAiQueue(deps: DrainAiQueueDeps): Promise<DrainResult> {
  if (drainInFlight) return { processed: 0, failed: 0, expired: 0, stopped: false, busy: true };
  drainInFlight = true;
  try {
    return await drainOnce(deps);
  } finally {
    drainInFlight = false;
  }
}

async function drainOnce(deps: DrainAiQueueDeps): Promise<DrainResult> {
  await purgeFinishedItems(deps.supabase);
  const expiredItems = await expirePendingItems(deps.supabase);
  const items = await getAllPendingItems(deps.supabase);

  // One Telegram summary per chat: what was saved and what failed for good.
  const summaries = new Map<number, ChatSummary>();
  const noteFailed = (item: AiQueueItem) => {
    if (item.channel !== "telegram" || !item.chat_id) return;
    const summary = chatSummary(summaries, item.chat_id);
    summary.failed.push(quoteForChat(item));
    summary.ids.push(item.id);
  };
  expiredItems.forEach(noteFailed);

  let processed = 0;
  let failed = 0;
  let failedForGood = expiredItems.length;
  let stopped = false;

  for (const item of items) {
    try {
      if (!(await authorCanWrite(deps, item))) {
        await markItemFailed(deps.supabase, item.id, "forbidden");
        failed++;
        failedForGood++;
        noteFailed(item);
        continue;
      }

      let outcome: { ok: boolean; description?: string; tipo?: string; count?: number };

      if (item.kind === "text" && item.channel === "telegram") {
        outcome = await processTextItem(deps, item);
      } else if ((item.kind === "photo" || item.kind === "pdf") && item.channel === "telegram") {
        outcome = await processMediaItem(deps, item);
      } else if (item.kind === "web_text" || item.channel === "web") {
        outcome = await processWebTextItem(deps, item);
      } else {
        // Albums are queued but there is no batch reprocessing for them.
        await markItemFailed(deps.supabase, item.id, "unsupported");
        failed++;
        failedForGood++;
        noteFailed(item);
        continue;
      }

      if (outcome.ok) {
        await markItemProcessed(deps.supabase, item.id, {
          description: outcome.description,
          tipo: outcome.tipo,
          count: outcome.count ?? 1,
        });
        processed++;
        if (item.channel === "telegram" && item.chat_id) {
          const icon = outcome.tipo === "ingreso" ? "🟢" : "🔴";
          const summary = chatSummary(summaries, item.chat_id);
          summary.saved.push(`${icon} ${escapeMarkdown(outcome.description || "Movimiento")}`);
          summary.ids.push(item.id);
        }
      } else {
        failed++;
        if (await incrementRetry(deps.supabase, item.id, item.retry_count)) {
          failedForGood++;
          noteFailed(item);
        }
      }
    } catch (err) {
      if (err instanceof GeminiUnavailableError) {
        // AI still down — stop processing, leave items in queue
        stopped = true;
        break;
      }
      console.error(`[drainAiQueue] error processing item ${item.id}:`, err);
      failed++;
      if (await incrementRetry(deps.supabase, item.id, item.retry_count)) {
        failedForGood++;
        noteFailed(item);
      }
    }
  }

  if (failedForGood > 0) {
    alertSuperadmin({
      code: "ai-queue:items-failed",
      title: "Cola de IA: mensajes que no se pudieron procesar",
      problem: `${failedForGood} mensaje(s) de la cola de IA terminaron como fallidos (vencidos, sin permiso, no soportados o con error al procesar).`,
      impact: "Los autores reciben el aviso para reenviarlos; los datos no se guardaron.",
      context: { failedForGood: String(failedForGood) },
      steps: [
        "Revisar en pending_ai_queue las filas con status = 'failed' y su result.reason.",
        "Si el motivo es processing_failed repetido, revisar los logs de [drainAiQueue] en Cloud Run.",
      ],
    });
  }

  if (deps.bot && summaries.size > 0) {
    for (const [chatId, summary] of summaries) {
      try {
        await deps.bot.api.sendMessage(chatId, buildChatSummaryText(summary), { parse_mode: "Markdown" });
        await markItemsSeen(deps.supabase, summary.ids);
      } catch (err) {
        console.error(`[drainAiQueue] failed to notify chat_id=${chatId}:`, err);
      }
    }
  }

  return { processed, failed, expired: expiredItems.length, stopped };
}
