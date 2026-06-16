import { addMonth, computeNextRun } from "../recurrentes.ts";

type SupabaseLike = {
  from(table: string): any;
};

type BotLike = {
  api: {
    sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown>;
  };
} | null;

export async function runRecurrentes({
  supabase,
  bot,
}: {
  supabase: SupabaseLike;
  bot: BotLike;
}): Promise<{ processed: number }> {
  if (!bot) return { processed: 0 };

  const today = new Date();
  // Pre-filter en DB: solo activos y no borrados (el loop ya los skipeaba, pero
  // sin este WHERE escaneábamos/transferíamos toda la tabla en cada corrida).
  const { data: recs } = await supabase
    .from("recurrentes")
    .select("*")
    .eq("is_active", true)
    .is("deleted_at", null);

  let processed = 0;

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
        if (r.chat_id) {
          bot.api.sendMessage(
            r.chat_id,
            `🔄 *Recurrente Registrado:* ${r.descripcion}\n💰 ${r.monto} ${r.moneda}`,
            { parse_mode: "Markdown" },
          );
        }
        processed++;
      }
    } catch (recErr) {
      console.error(`[cron:recurrentes] Error processing recurrente id=${r.id}:`, recErr);
    }
  }

  return { processed };
}
