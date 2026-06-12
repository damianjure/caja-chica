/**
 * aiEvents.ts — persist Gemini capacity events so a superadmin can see whether
 * the models + fallback are hitting their limits over time.
 *
 * Two outcomes are recorded:
 *   - fallback_used   : primary key hit 429/503, the fallback key took over.
 *   - both_exhausted  : the fallback also failed (or there was none) → the user
 *                       got "IA no disponible". This is the real hard limit.
 *
 * Persistence is fire-and-forget and best-effort (like alertSuperadmin): it
 * NEVER blocks or throws into the request path, and swallows the missing-table
 * case so it's inert until the migration is applied. Configured once at startup.
 */

import type { SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

let _supabase: SupabaseLike | null = null;

export function configureAiEvents(deps: { supabase: SupabaseLike }): void {
  _supabase = deps.supabase;
}

export type AiEventKind = "text" | "media";
export type AiEventOutcome = "fallback_used" | "both_exhausted";

export interface AiEventInput {
  code: string;
  kind: AiEventKind;
  outcome: AiEventOutcome;
  context?: Record<string, unknown>;
}

export function recordAiEvent(input: AiEventInput): void {
  void persist(input).catch((e) => console.error("[aiEvents] persist failed:", e));
}

async function persist(input: AiEventInput): Promise<void> {
  if (!_supabase) return;
  const { error } = await _supabase.from("ai_events").insert({
    code: input.code,
    kind: input.kind,
    outcome: input.outcome,
    context: input.context ?? {},
  });
  if (error && !isMissingSchemaArtifactError(error)) {
    console.warn("[aiEvents] insert error:", error);
  }
}

export interface AiHealthBucket {
  fallback_used: number;
  both_exhausted: number;
}

export interface AiHealth {
  status: "ok" | "warn" | "critical";
  last24h: AiHealthBucket;
  last7d: AiHealthBucket;
}

/** ≥ this many fallbacks in 24h → "warn" (leaning on the fallback a lot). */
export const WARN_FALLBACKS_24H = 5;

/**
 * Aggregate the last 7 days of AI events into a health summary. Resilient: if
 * the table doesn't exist yet (pre-migration) it returns an all-zero "ok".
 */
export async function getAiHealth(supabase: SupabaseLike, now: Date = new Date()): Promise<AiHealth> {
  const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  let rows: Array<{ created_at: string; outcome: string }> = [];
  try {
    const { data, error } = await supabase
      .from("ai_events")
      .select("created_at, outcome")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    } else {
      rows = (data ?? []) as Array<{ created_at: string; outcome: string }>;
    }
  } catch (err) {
    if (!isMissingSchemaArtifactError(err)) throw err;
  }

  const count = (sinceIso: string, outcome: string) =>
    rows.filter((r) => r.created_at >= sinceIso && r.outcome === outcome).length;

  const last24h: AiHealthBucket = {
    fallback_used: count(since24h, "fallback_used"),
    both_exhausted: count(since24h, "both_exhausted"),
  };
  const last7d: AiHealthBucket = {
    fallback_used: count(since7d, "fallback_used"),
    both_exhausted: count(since7d, "both_exhausted"),
  };

  const status: AiHealth["status"] =
    last24h.both_exhausted > 0 ? "critical" : last24h.fallback_used >= WARN_FALLBACKS_24H ? "warn" : "ok";

  return { status, last24h, last7d };
}
