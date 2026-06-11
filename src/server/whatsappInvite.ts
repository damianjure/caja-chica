/**
 * whatsappInvite.ts — WhatsApp link write-path (two-factor invite).
 *
 * Mirror of the Telegram editor/viewer flow:
 *   1. Owner generates an invite token (createWhatsAppInviteToken).
 *   2. The invited number messages the bot with the token (acceptWhatsAppInvite)
 *      → creates a whatsapp_links row as `pending_owner_confirm`.
 *   3. Owner confirms from the dashboard (confirmWhatsAppLink) → `active`.
 *
 * DB-only cores: token/expiry/now are injected so they're deterministic and
 * fake-testable. The HTTP routes generate token+expiry; the channel router
 * calls acceptWhatsAppInvite.
 */

import type { SupabaseLike } from "./contracts.ts";

export interface CreateWhatsAppInviteArgs {
  dashboardId: string;
  targetUserId: string;
  createdByUserId: string;
  token: string;
  expiresAt: string;
}

/** Expire prior pending tokens for this target, then insert a fresh one. */
export async function createWhatsAppInviteToken(
  supabase: SupabaseLike,
  args: CreateWhatsAppInviteArgs,
): Promise<{ token: string; expiresAt: string }> {
  await supabase
    .from("whatsapp_invite_tokens")
    .update({ status: "expired" })
    .eq("target_user_id", args.targetUserId)
    .eq("dashboard_id", args.dashboardId)
    .eq("status", "pending");

  const { error } = await supabase.from("whatsapp_invite_tokens").insert({
    token: args.token,
    dashboard_id: args.dashboardId,
    target_user_id: args.targetUserId,
    created_by_user_id: args.createdByUserId,
    expires_at: args.expiresAt,
    status: "pending",
  });
  if (error) throw error;
  return { token: args.token, expiresAt: args.expiresAt };
}

export interface AcceptWhatsAppInviteArgs {
  token: string;
  phone: string;
  name?: string | null;
  now?: Date;
}

export type AcceptWhatsAppInviteResult =
  | { status: "invalid_token" }
  | { status: "expired" }
  | { status: "pivot_blocked" }
  | { status: "error" }
  | { status: "linked"; dashboardId: string; linkId?: string };

/**
 * The invited number redeems a token. Validates token (pending + not expired),
 * blocks a pivot (a number already linked elsewhere must be revoked first),
 * then creates a pending_owner_confirm link and claims the token.
 */
export async function acceptWhatsAppInvite(
  supabase: SupabaseLike,
  args: AcceptWhatsAppInviteArgs,
): Promise<AcceptWhatsAppInviteResult> {
  const now = args.now ?? new Date();

  const { data: tokenRows, error: tokenError } = await supabase
    .from("whatsapp_invite_tokens")
    .select("id, dashboard_id, target_user_id, expires_at, status")
    .eq("token", args.token)
    .eq("status", "pending")
    .limit(1);
  if (tokenError) return { status: "error" };
  const tokenRow = tokenRows?.[0];
  if (!tokenRow) return { status: "invalid_token" };

  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < now.getTime()) {
    await supabase.from("whatsapp_invite_tokens").update({ status: "expired" }).eq("id", tokenRow.id);
    return { status: "expired" };
  }

  // Anti-pivot: a number already linked (any non-revoked link) must revoke first.
  const { data: existing, error: existingError } = await supabase
    .from("whatsapp_links")
    .select("id, dashboard_id, status")
    .eq("whatsapp_phone", args.phone)
    .neq("status", "revoked")
    .limit(1);
  if (existingError) return { status: "error" };
  if (existing?.[0]) return { status: "pivot_blocked" };

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_links")
    .insert({
      whatsapp_phone: args.phone,
      whatsapp_name: args.name ?? null,
      dashboard_id: tokenRow.dashboard_id,
      app_user_id: tokenRow.target_user_id,
      status: "pending_owner_confirm",
    })
    .select("id");
  if (insertError) return { status: "error" };

  await supabase.from("whatsapp_invite_tokens").update({ status: "claimed" }).eq("id", tokenRow.id);

  return { status: "linked", dashboardId: tokenRow.dashboard_id, linkId: inserted?.[0]?.id as string | undefined };
}

/** Owner confirms a pending link → active. Scoped to the owner's dashboard. */
export async function confirmWhatsAppLink(
  supabase: SupabaseLike,
  args: { linkId: string; dashboardId: string; now?: Date },
): Promise<{ confirmed: boolean }> {
  const { data, error } = await supabase
    .from("whatsapp_links")
    .update({ status: "active", linked_at: (args.now ?? new Date()).toISOString() })
    .eq("id", args.linkId)
    .eq("dashboard_id", args.dashboardId)
    .eq("status", "pending_owner_confirm")
    .select("id")
    .limit(1);
  if (error) throw error;
  return { confirmed: Boolean(data?.[0]) };
}

/** Revoke a link (owner, or the member revoking their own). Scoped to dashboard. */
export async function revokeWhatsAppLink(
  supabase: SupabaseLike,
  args: { linkId: string; dashboardId: string },
): Promise<{ revoked: boolean }> {
  const { data, error } = await supabase
    .from("whatsapp_links")
    .update({ status: "revoked" })
    .eq("id", args.linkId)
    .eq("dashboard_id", args.dashboardId)
    .neq("status", "revoked")
    .select("id")
    .limit(1);
  if (error) throw error;
  return { revoked: Boolean(data?.[0]) };
}

/** List a dashboard's WhatsApp links for the team panel. */
export async function listWhatsAppLinks(supabase: SupabaseLike, dashboardId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("whatsapp_links")
    .select("id, whatsapp_phone, whatsapp_name, app_user_id, status, linked_at, created_at")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
