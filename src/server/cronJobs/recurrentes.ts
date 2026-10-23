import { addMonth, computeNextRun } from "../recurrentes.ts";
import { alertSuperadmin } from "../alertSuperadmin.ts";
import { resolveTelegramChatIds } from "../telegramChats.ts";

type SupabaseLike = {
  from(table: string): any;
};

type BotLike = {
  api: {
    sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown>;
  };
} | null;

/**
 * Chat to notify about a generated recurrente: the one it was created from
 * (bot-created recurrentes), otherwise the dashboard owner's linked chat.
 */
async function resolveNoticeChat(supabase: SupabaseLike, r: any): Promise<string | number | null> {
  if (r.chat_id) return r.chat_id;
  let ownerUserId: string | null = r.owner_user_id ?? null;
  if (r.dashboard_id) {
    const { data } = await supabase
      .from("dashboard_members")
      .select("user_id")
      .eq("dashboard_id", r.dashboard_id)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1);
    ownerUserId = data?.[0]?.user_id ?? ownerUserId;
  }
  if (!ownerUserId) return null;
  const chats = await resolveTelegramChatIds(supabase, [ownerUserId]);
  return chats.get(ownerUserId) ?? null;
}

export async function runRecurrentes({
  supabase,
  bot,
  alert = alertSuperadmin,
}: {
  supabase: SupabaseLike;
  bot: BotLike;
  alert?: typeof alertSuperadmin;
}): Promise<{ processed: number; failed: number }> {
  const today = new Date();
  // Pre-filter en DB: solo activos y no borrados (el loop ya los skipeaba, pero
  // sin este WHERE escaneábamos/transferíamos toda la tabla en cada corrida).
  const { data: recs } = await supabase
    .from("recurrentes")
    .select("*")
    .eq("is_active", true)
    .is("deleted_at", null);

  let processed = 0;
  let failed = 0;

  for (const r of recs ?? []) {
    if (!r.is_active || r.deleted_at) continue;

    try {
      let shouldProcess = false;
      const last = r.last_processed ? new Date(r.last_processed) : null;

      if (!last) {
        shouldProcess = true;
      } else {
        const diff = today.getTime() - last.getTime();
        const days = diff / (1000 * 3600 * 24);
        if (r.frecuencia === "diario" && days >= 1) shouldProcess = true;
        if (r.frecuencia === "semanal" && days >= 7) shouldProcess = true;
        if (r.frecuencia === "quincenal" && days >= 14) shouldProcess = true;
        if (r.frecuencia === "mensual") {
          const nextRun = computeNextRun(
            "mensual",
            last,
            typeof r.day_of_month === "number" ? r.day_of_month : null,
            today,
          );
          if (nextRun && today >= nextRun) shouldProcess = true;
        }
        if (r.frecuencia === "anual") {
          let nextRun = addMonth(last);
          for (let i = 0; i < 11; i++) nextRun = addMonth(nextRun);
          if (today >= nextRun) shouldProcess = true;
        }
      }

      if (shouldProcess) {
        const { error: insertErr } = await supabase.from("movimientos").insert([
          {
            ...(r.dashboard_id && r.created_by_user_id
              ? { dashboard_id: r.dashboard_id, created_by_user_id: r.created_by_user_id }
              : { owner_user_id: r.owner_user_id }),
            monto: Math.abs(r.monto),
            tipo: r.tipo,
            moneda: r.moneda,
            categoria: r.categoria,
            empresa_nombre: r.empresa_nombre,
            descripcion: r.descripcion + " (Recurrente)",
            original_text: "System Generated",
            source: "recurrente",
            conciliado: true,
            conciliado_notas: null,
          },
        ]);
        if (insertErr) throw insertErr;
        await supabase
          .from("recurrentes")
          .update({ last_processed: today.toISOString() })
          .eq("id", r.id);
        processed++;
        // The movement is already saved: a notice failure must not count as a failed recurrente.
        if (bot) {
          try {
            const chatId = await resolveNoticeChat(supabase, r);
            if (chatId) {
              await bot.api.sendMessage(
                chatId,
                `🔄 *Recurrente Registrado:* ${r.descripcion}\n💰 ${r.monto} ${r.moneda}`,
                { parse_mode: "Markdown" },
              );
            }
          } catch (noticeErr) {
            console.error(`[cron:recurrentes] notice failed for recurrente id=${r.id}:`, noticeErr);
          }
        }
      }
    } catch (recErr) {
      failed++;
      console.error(`[cron:recurrentes] Error processing recurrente id=${r.id}:`, recErr);
    }
  }

  if (failed > 0) {
    alert({
      code: "cron:recurrentes-failed",
      title: "Recurrentes: no se pudieron generar algunos movimientos",
      problem: `${failed} recurrente(s) fallaron al generar su movimiento en la corrida diaria.`,
      impact: "Esos movimientos no se registraron hoy; se reintentan en la próxima corrida porque last_processed no se actualizó.",
      context: { failed: String(failed), processed: String(processed) },
      steps: [
        "Revisar los logs de [cron:recurrentes] en Cloud Run para ver el error de cada recurrente.",
        "Verificar permisos/constraints de la tabla movimientos si el error es de insert.",
      ],
    });
  }

  return { processed, failed };
}
