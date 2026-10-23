import type { SupabaseLike } from "./contracts.ts";

export type AiQueueStatus = "pending" | "processed" | "failed";

/** Why an item ended as `failed`. */
export type AiQueueFailureReason = "processing_failed" | "expired" | "forbidden" | "unsupported";

export interface AiQueueResult {
  description?: string;
  tipo?: string;
  count?: number;
  reason?: AiQueueFailureReason;
}

export interface AiQueueItem {
  id: string;
  dashboard_id: string | null;
  /** The author of the message (web: the session user; Telegram: the linked user). */
  owner_user_id: string | null;
  channel: "telegram" | "web";
  chat_id: number | null;
  kind: "text" | "photo" | "pdf" | "album" | "web_text";
  text_content: string | null;
  file_ids: string[] | null;
  mime_types: string[] | null;
  created_at: string;
  expires_at: string;
  retry_count: number;
  status: AiQueueStatus;
  processed_at: string | null;
  result: AiQueueResult | null;
  seen_at: string | null;
}

export const MAX_QUEUE_RETRIES = 3;

type EnqueueInput = Omit<
  AiQueueItem,
  "id" | "created_at" | "expires_at" | "retry_count" | "status" | "processed_at" | "result" | "seen_at"
>;

/**
 * Author to store on a Telegram queue item. Members linked through
 * `telegram_links` have `ownerUserId = null` and their id in `userId`; legacy
 * owners (`usuarios`) have it in `ownerUserId`.
 */
export function queueAuthorId(linked: { userId: string | null; ownerUserId: string | null }): string | null {
  return linked.userId ?? linked.ownerUserId ?? null;
}

export async function enqueueAiItem(
  supabase: SupabaseLike,
  item: EnqueueInput,
): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .insert([item])
    .select("id")
    .single();
  if (error) {
    console.error("[aiQueue] enqueue error:", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

export async function getPendingWebItems(
  supabase: SupabaseLike,
  scope: { dashboardId?: string | null; ownerUserId?: string | null },
): Promise<AiQueueItem[]> {
  if (!scope.dashboardId && !scope.ownerUserId) return [];
  let query = (supabase as any)
    .from("pending_ai_queue")
    .select("*")
    .eq("channel", "web")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (scope.dashboardId) {
    query = query.eq("dashboard_id", scope.dashboardId);
  } else {
    query = query.eq("owner_user_id", scope.ownerUserId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[aiQueue] getPendingWebItems error:", error);
    return [];
  }
  return (data ?? []) as AiQueueItem[];
}

export async function getAllPendingItems(supabase: SupabaseLike): Promise<AiQueueItem[]> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .select("*")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[aiQueue] getAllPendingItems error:", error);
    return [];
  }
  return (data ?? []) as AiQueueItem[];
}

export async function markItemProcessed(supabase: SupabaseLike, id: string, result: AiQueueResult): Promise<void> {
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ status: "processed", processed_at: new Date().toISOString(), result })
    .eq("id", id);
  if (error) console.error("[aiQueue] markItemProcessed error:", error);
}

export async function markItemFailed(
  supabase: SupabaseLike,
  id: string,
  reason: AiQueueFailureReason,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ ...extra, status: "failed", processed_at: new Date().toISOString(), result: { reason } })
    .eq("id", id);
  if (error) console.error("[aiQueue] markItemFailed error:", error);
}

/**
 * Counts a failed attempt. The last allowed attempt marks the item `failed`
 * (it used to stay in the table, never selected again, until it was purged).
 * Returns true when the item is now failed for good.
 */
export async function incrementRetry(supabase: SupabaseLike, id: string, currentCount: number): Promise<boolean> {
  const next = currentCount + 1;
  if (next >= MAX_QUEUE_RETRIES) {
    await markItemFailed(supabase, id, "processing_failed", { retry_count: next });
    return true;
  }
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ retry_count: next })
    .eq("id", id);
  if (error) console.error("[aiQueue] incrementRetry error:", error);
  return false;
}

/** Marks pending items past their expiry as `failed: expired` and returns them. */
export async function expirePendingItems(supabase: SupabaseLike): Promise<AiQueueItem[]> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (error) {
    console.error("[aiQueue] expirePendingItems error:", error);
    return [];
  }
  const expired = (data ?? []) as AiQueueItem[];
  for (const item of expired) await markItemFailed(supabase, item.id, "expired");
  return expired;
}

export async function markItemsSeen(supabase: SupabaseLike, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ seen_at: new Date().toISOString() })
    .in("id", ids);
  if (error) console.error("[aiQueue] markItemsSeen error:", error);
}

/** Processed/failed web items of one author that the author has not seen yet. */
export async function getUnseenWebResults(supabase: SupabaseLike, authorUserId: string): Promise<AiQueueItem[]> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .select("*")
    .eq("channel", "web")
    .eq("owner_user_id", authorUserId)
    .neq("status", "pending")
    .is("seen_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[aiQueue] getUnseenWebResults error:", error);
    return [];
  }
  return (data ?? []) as AiQueueItem[];
}

/** Marks the given results as seen, only if they belong to the author. */
export async function markWebResultsSeen(supabase: SupabaseLike, authorUserId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ seen_at: new Date().toISOString() })
    .eq("owner_user_id", authorUserId)
    .eq("channel", "web")
    .in("id", ids);
  if (error) console.error("[aiQueue] markWebResultsSeen error:", error);
}

/**
 * Deletes items that are done and either seen or older than 30 days.
 * Pending items are never deleted here.
 */
export async function purgeFinishedItems(supabase: SupabaseLike): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .delete()
    .neq("status", "pending")
    .or(`seen_at.not.is.null,processed_at.lt.${cutoff}`)
    .select("id");
  if (error) {
    console.error("[aiQueue] purgeFinishedItems error:", error);
    return 0;
  }
  return (data as unknown[])?.length ?? 0;
}

export async function purgeByChatId(supabase: SupabaseLike, chatId: number): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .delete()
    .eq("chat_id", chatId)
    .eq("channel", "telegram")
    .select("id");
  if (error) {
    console.error("[aiQueue] purgeByChatId error:", error);
    return 0;
  }
  return (data as unknown[])?.length ?? 0;
}
