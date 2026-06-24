import type { SupabaseLike } from "./contracts.ts";

export interface AiQueueItem {
  id: string;
  dashboard_id: string | null;
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
}

type EnqueueInput = Omit<AiQueueItem, "id" | "created_at" | "expires_at" | "retry_count">;

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

export async function getAllPendingItems(
  supabase: SupabaseLike,
  maxRetries = 3,
): Promise<AiQueueItem[]> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .lt("retry_count", maxRetries)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[aiQueue] getAllPendingItems error:", error);
    return [];
  }
  return (data ?? []) as AiQueueItem[];
}

export async function markItemProcessed(supabase: SupabaseLike, id: string): Promise<void> {
  const { error } = await (supabase as any).from("pending_ai_queue").delete().eq("id", id);
  if (error) console.error("[aiQueue] markItemProcessed error:", error);
}

export async function incrementRetry(supabase: SupabaseLike, id: string, currentCount: number): Promise<void> {
  const { error } = await (supabase as any)
    .from("pending_ai_queue")
    .update({ retry_count: currentCount + 1 })
    .eq("id", id);
  if (error) console.error("[aiQueue] incrementRetry error:", error);
}

export async function purgeExpired(supabase: SupabaseLike): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("pending_ai_queue")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (error) {
    console.error("[aiQueue] purgeExpired error:", error);
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
