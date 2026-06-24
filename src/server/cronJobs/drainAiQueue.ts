import {
  getAllPendingItems,
  markItemProcessed,
  incrementRetry,
  purgeExpired,
  type AiQueueItem,
} from "../aiQueue.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "../gemini.ts";
import { geminiGenerateText, GeminiUnavailableError } from "../geminiWithFallback.ts";
import { applyTelegramDataScope } from "../telegramAccess.ts";
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
): Promise<{ ok: boolean }> {
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

  for (const rawItem of extracted.items as any[]) {
    const ownership: Record<string, string> = {};
    if (item.dashboard_id) ownership.dashboard_id = item.dashboard_id;
    if (item.owner_user_id) ownership.owner_user_id = item.owner_user_id;
    await (deps.supabase as any).from("movimientos").insert([{
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
    }]);
  }

  return { ok: true };
}

export async function runDrainAiQueue(deps: DrainAiQueueDeps): Promise<DrainResult> {
  const expired = await purgeExpired(deps.supabase);
  const items = await getAllPendingItems(deps.supabase);

  if (items.length === 0) return { processed: 0, failed: 0, expired, stopped: false };

  const summaries = new Map<number, string[]>();

  let processed = 0;
  let failed = 0;
  let stopped = false;

  for (const item of items) {
    try {
      let outcome: { ok: boolean; description?: string; tipo?: string };

      if (item.kind === "text" && item.channel === "telegram") {
        outcome = await processTextItem(deps, item);
      } else if ((item.kind === "photo" || item.kind === "pdf") && item.channel === "telegram") {
        outcome = await processMediaItem(deps, item);
      } else if (item.kind === "web_text" || item.channel === "web") {
        outcome = await processWebTextItem(deps, item);
      } else {
        await incrementRetry(deps.supabase, item.id, item.retry_count);
        failed++;
        continue;
      }

      if (outcome.ok) {
        await markItemProcessed(deps.supabase, item.id);
        processed++;
        if (item.chat_id) {
          const icon = outcome.tipo === "ingreso" ? "🟢" : "🔴";
          const label = outcome.description ? `${icon} ${outcome.description}` : `${icon} Movimiento`;
          const list = summaries.get(item.chat_id) ?? [];
          list.push(label);
          summaries.set(item.chat_id, list);
        }
      } else {
        await incrementRetry(deps.supabase, item.id, item.retry_count);
        failed++;
      }
    } catch (err) {
      if (err instanceof GeminiUnavailableError) {
        // AI still down — stop processing, leave items in queue
        stopped = true;
        break;
      }
      console.error(`[drainAiQueue] error processing item ${item.id}:`, err);
      await incrementRetry(deps.supabase, item.id, item.retry_count);
      failed++;
    }
  }

  // Send ONE summary per chat_id
  if (deps.bot && summaries.size > 0) {
    for (const [chatId, lines] of summaries) {
      const count = lines.length;
      const lineList = lines.slice(0, 10).join("\n");
      const more = lines.length > 10 ? `\n_… y ${lines.length - 10} más_` : "";
      const text =
        `✅ *La IA está disponible de nuevo.*\n` +
        `Se procesaron ${count} mensaje${count !== 1 ? "s" : ""} que tenías pendiente${count !== 1 ? "s" : ""}:\n\n` +
        lineList +
        more;
      try {
        await deps.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" });
      } catch (err) {
        console.error(`[drainAiQueue] failed to notify chat_id=${chatId}:`, err);
      }
    }
  }

  return { processed, failed, expired, stopped };
}
