// Maintenance mode service — in-memory cache + Supabase source of truth.
// Single-instance invariant: Cloud Run max=1. If autoscale > 1, replace Map cache
// with a shared store.

import type { SupabaseLike } from "./app.ts";

export type MaintenanceStatus = "none" | "grace" | "active" | "scheduled";

export interface MaintenanceState {
  status: MaintenanceStatus;
  started_at: string | null;
  scheduled_at: string | null;
  grace_ends_at: string | null;
  estimated_end_at: string | null;
  message: string | null;
}

interface MaintenanceRow extends MaintenanceState {
  id: number;
  notification_sent_30min: boolean;
}

const CACHE_TTL_MS = 30_000; // 30 seconds

export const maintenanceCache: { state: MaintenanceState; cachedAt: number } = {
  state: {
    status: "none",
    started_at: null,
    scheduled_at: null,
    grace_ends_at: null,
    estimated_end_at: null,
    message: null,
  },
  cachedAt: 0,
};

export function invalidateCache(): void {
  maintenanceCache.cachedAt = 0;
}

function rowToState(row: MaintenanceRow | null): MaintenanceState {
  if (!row) {
    return { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  }
  return {
    status: (row.status ?? "none") as MaintenanceStatus,
    started_at: row.started_at ?? null,
    scheduled_at: row.scheduled_at ?? null,
    grace_ends_at: row.grace_ends_at ?? null,
    estimated_end_at: row.estimated_end_at ?? null,
    message: row.message ?? null,
  };
}

export async function getMaintenanceState(supabase: SupabaseLike): Promise<MaintenanceState> {
  const now = Date.now();
  if (maintenanceCache.cachedAt > 0 && now - maintenanceCache.cachedAt < CACHE_TTL_MS) {
    return maintenanceCache.state;
  }

  const { data, error } = await (supabase as any)
    .from("maintenance_windows")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    // If table doesn't exist yet (during migration), fall back to none.
    console.warn("[maintenance] Could not read maintenance_windows:", error.message ?? error);
    return { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  }

  const state = rowToState(data as MaintenanceRow);
  maintenanceCache.state = state;
  maintenanceCache.cachedAt = Date.now();
  return state;
}

export async function setMaintenanceStatus(
  supabase: SupabaseLike,
  patch: Partial<MaintenanceRow>,
): Promise<MaintenanceState> {
  const payload = { id: 1, ...patch, updated_at: new Date().toISOString() };

  const { data, error } = await (supabase as any)
    .from("maintenance_windows")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[maintenance] setMaintenanceStatus failed: ${error.message ?? JSON.stringify(error)}`);
  }

  const state = rowToState(data as MaintenanceRow);
  maintenanceCache.state = state;
  maintenanceCache.cachedAt = Date.now();
  return state;
}

// isWriteBlocked reads only from cache — zero async latency on hot path.
// Grace AND Active both block writes per spec requirement:
// "During grace, new write operations MUST be rejected with a maintenance-specific HTTP error."
export function isWriteBlocked(): boolean {
  const { status } = maintenanceCache.state;
  return status === "active" || status === "grace";
}

export async function hydrateCache(supabase: SupabaseLike): Promise<void> {
  try {
    await getMaintenanceState(supabase);
    console.log("[maintenance] Cache hydrated, status:", maintenanceCache.state.status);
  } catch (err) {
    console.warn("[maintenance] hydrateCache failed (non-fatal):", err);
  }
}

// reconcileTransitions: called by per-minute cron.
// Handles: scheduled→grace, grace→active, 30-min reminder flag.
export async function reconcileTransitions(
  supabase: SupabaseLike,
  notifyFn?: (type: "start" | "end" | "reminder") => Promise<void>,
): Promise<void> {
  const state = await getMaintenanceState(supabase);
  const now = new Date();

  if (state.status === "scheduled" && state.scheduled_at) {
    const scheduledAt = new Date(state.scheduled_at);
    const msUntil = scheduledAt.getTime() - now.getTime();

    // Fetch full row to check notification flag
    const { data: row } = await (supabase as any)
      .from("maintenance_windows")
      .select("notification_sent_30min")
      .eq("id", 1)
      .single() as { data: MaintenanceRow | null };

    // 30-min reminder
    if (msUntil <= 30 * 60_000 && msUntil > 0 && !(row?.notification_sent_30min)) {
      try {
        if (notifyFn) await notifyFn("reminder");
      } catch (err) {
        console.error("[maintenance] 30-min reminder notification failed:", err);
      }
      await (supabase as any)
        .from("maintenance_windows")
        .update({ notification_sent_30min: true, updated_at: now.toISOString() })
        .eq("id", 1);
      invalidateCache();
    }

    // Transition scheduled → grace when starts_at is reached
    if (now >= scheduledAt) {
      const graceEndsAt = new Date(scheduledAt.getTime() + 5 * 60_000).toISOString();
      await setMaintenanceStatus(supabase, {
        status: "grace",
        grace_ends_at: graceEndsAt,
      });
      try {
        if (notifyFn) await notifyFn("start");
      } catch (err) {
        console.error("[maintenance] start notification failed:", err);
      }
    }
  } else if (state.status === "grace" && state.grace_ends_at) {
    const graceEndsAt = new Date(state.grace_ends_at);
    if (now >= graceEndsAt) {
      await setMaintenanceStatus(supabase, {
        status: "active",
        started_at: now.toISOString(),
      });
    }
  }
}
