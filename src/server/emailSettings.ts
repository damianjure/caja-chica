// emailSettings.ts — active sender resolution with 5-min in-process cache.
// Mirrors maintenance.ts cache pattern.
// Single-instance invariant: Cloud Run max=1.
//
// INVARIANT: DB read failure OR no row OR empty string → ENV_FALLBACK.
// This means the module is safe to deploy before email_management_phase.sql is applied.

import type { SupabaseLike } from "./app.ts";

export interface ActiveSender {
  fromEmail: string;
  fromName: string;
}

const ENV_FALLBACK: ActiveSender = {
  fromEmail: process.env.FROM_EMAIL ?? "hola@damianjure.com",
  fromName: process.env.FROM_NAME ?? "Caja Chica",
};

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

// Module-level cache — same pattern as maintenance.ts.
export const senderCache: { sender: ActiveSender; cachedAt: number } = {
  sender: ENV_FALLBACK,
  cachedAt: 0,
};

export function invalidateSenderCache(): void {
  senderCache.cachedAt = 0;
}

export async function getActiveSender(supabase: SupabaseLike): Promise<ActiveSender> {
  const now = Date.now();
  if (senderCache.cachedAt > 0 && now - senderCache.cachedAt < CACHE_TTL_MS) {
    return senderCache.sender;
  }

  try {
    const { data, error } = await (supabase as any)
      .from("email_settings")
      .select("from_email, from_name")
      .eq("id", 1)
      .single();

    if (error || !data) {
      // DB error or no row → env fallback (INV-1, INV-6)
      if (error) {
        console.warn("[emailSettings] Could not read email_settings:", error.message ?? error);
      }
      senderCache.sender = ENV_FALLBACK;
      senderCache.cachedAt = now;
      return ENV_FALLBACK;
    }

    const fromEmail =
      typeof data.from_email === "string" && data.from_email.trim()
        ? data.from_email.trim()
        : ENV_FALLBACK.fromEmail;
    const fromName =
      typeof data.from_name === "string" && data.from_name.trim()
        ? data.from_name.trim()
        : ENV_FALLBACK.fromName;

    const sender: ActiveSender = { fromEmail, fromName };
    senderCache.sender = sender;
    senderCache.cachedAt = now;
    return sender;
  } catch (err) {
    console.warn("[emailSettings] getActiveSender threw:", err);
    return ENV_FALLBACK;
  }
}

export async function setEmailSettings(
  supabase: SupabaseLike,
  { fromEmail, fromName, updatedBy }: { fromEmail: string; fromName: string; updatedBy?: string | null },
): Promise<ActiveSender> {
  const payload = {
    id: 1,
    from_email: fromEmail,
    from_name: fromName,
    updated_at: new Date().toISOString(),
    ...(updatedBy !== undefined ? { updated_by: updatedBy } : {}),
  };

  const { data, error } = await (supabase as any)
    .from("email_settings")
    .upsert(payload, { onConflict: "id" })
    .select("from_email, from_name")
    .single();

  if (error) {
    throw new Error(`[emailSettings] setEmailSettings failed: ${error.message ?? JSON.stringify(error)}`);
  }

  const sender: ActiveSender = {
    fromEmail: data?.from_email ?? fromEmail,
    fromName: data?.from_name ?? fromName,
  };
  senderCache.sender = sender;
  senderCache.cachedAt = Date.now();
  return sender;
}

export async function hydrateSenderCache(supabase: SupabaseLike): Promise<void> {
  try {
    await getActiveSender(supabase);
    console.log("[emailSettings] Sender cache hydrated:", senderCache.sender.fromEmail);
  } catch (err) {
    console.warn("[emailSettings] hydrateSenderCache failed (non-fatal):", err);
  }
}
