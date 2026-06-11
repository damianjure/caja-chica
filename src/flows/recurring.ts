/**
 * flows/recurring.ts — channel-agnostic recurrentes core.
 *
 * Data operations every channel shares: list with computed next run, create,
 * and pause/reactivate. The guided "new recurrente" wizard and all rendering
 * (Markdown, inline keyboards) are per-channel and stay out. Scope and the
 * toggle permission check are channel-specific, so they come in as closures.
 */

import type { SupabaseLike } from "../server/contracts.ts";
import { computeNextRun, relativeRunLabel, type Frecuencia } from "../server/recurrentes.ts";

export interface RecurrenteWithNextRun {
  [key: string]: any;
  next_run_at: string | null;
  next_run_label: string;
}

/** Scoped list of non-deleted recurrentes, each with its computed next run. */
export async function listRecurrentesWithNextRun(
  supabase: SupabaseLike,
  applyScope: (query: any) => any,
  now: Date = new Date(),
): Promise<RecurrenteWithNextRun[]> {
  const { data, error } = await applyScope(supabase.from("recurrentes").select("*"))
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r: any) => {
    const lastProcessed = r.last_processed ? new Date(r.last_processed) : null;
    const dayOfMonth = typeof r.day_of_month === "number" ? r.day_of_month : null;
    const nextRun = computeNextRun(r.frecuencia as Frecuencia, lastProcessed, dayOfMonth, now);
    return {
      ...r,
      next_run_at: nextRun ? nextRun.toISOString() : null,
      next_run_label: relativeRunLabel(nextRun, now),
    };
  });
}

export interface CreateRecurrenteArgs {
  /** Channel-resolved write ownership (dashboard_id+created_by_user_id or owner_user_id). */
  ownership: Record<string, unknown>;
  monto: number;
  tipo: "ingreso" | "egreso";
  moneda: string;
  frecuencia: Frecuencia;
  descripcion: string;
  categoria?: string | null;
  dayOfMonth?: number | null;
  /** Telegram chat to notify when the cron fires (null for other channels for now). */
  notifyChatId?: number | null;
}

/** Insert a recurrente. Returns false on insert failure (caller renders the error). */
export async function createRecurrente(
  supabase: SupabaseLike,
  args: CreateRecurrenteArgs,
): Promise<boolean> {
  const { error } = await supabase.from("recurrentes").insert([{
    ...args.ownership,
    monto: args.monto,
    tipo: args.tipo,
    moneda: args.moneda,
    frecuencia: args.frecuencia,
    descripcion: args.descripcion,
    categoria: args.categoria?.trim() || (args.tipo === "ingreso" ? "Ingresos" : "Varios"),
    day_of_month: args.frecuencia === "mensual" ? (args.dayOfMonth ?? null) : null,
    empresa_nombre: null,
    chat_id: args.notifyChatId ?? null,
    last_processed: null,
  }]);
  if (error) {
    console.error("createRecurrente error:", error);
    return false;
  }
  return true;
}

export interface ToggleRecurrenteResult {
  status: "fetch_error" | "update_error" | "not_found" | "already" | "ok";
  /** Present for "already" and "ok". */
  rec?: any;
}

/**
 * Pause (active=false) or reactivate (active=true) a recurrente. Both the
 * SELECT and the UPDATE are scope-guarded; `canToggle` is the channel's
 * permission check over the fetched row.
 */
export async function toggleRecurrente(
  supabase: SupabaseLike,
  applyScope: (query: any) => any,
  recId: string,
  active: boolean,
  canToggle: (rec: any) => boolean,
): Promise<ToggleRecurrenteResult> {
  const { data: rows, error: fetchErr } = await applyScope(
    supabase
      .from("recurrentes")
      .select("id, dashboard_id, owner_user_id, deleted_at, is_active, descripcion, monto, moneda")
      .eq("id", recId),
  );
  if (fetchErr) {
    console.error("[toggleRecurrente] fetch error:", fetchErr);
    return { status: "fetch_error" };
  }

  const rec = rows?.[0];
  if (!rec || !canToggle(rec)) return { status: "not_found" };
  if (rec.is_active === active) return { status: "already", rec };

  const { error: updateErr } = await applyScope(
    supabase.from("recurrentes").update({ is_active: active }).eq("id", recId),
  );
  if (updateErr) {
    console.error("[toggleRecurrente] update error:", updateErr);
    return { status: "update_error" };
  }
  return { status: "ok", rec };
}
