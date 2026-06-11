/**
 * whatsappAccess.ts — WhatsApp identity resolution.
 *
 * Mirror of telegramAccess for the WhatsApp channel: resolve a phone number to a
 * dashboard link + role/permissions. The link record shape and the data-scope /
 * ownership / permission helpers are channel-neutral, so they are reused from
 * telegramAccess rather than duplicated — only the lookup (whatsapp_links by
 * phone) is WhatsApp-specific.
 *
 * Unlike Telegram there is no legacy `usuarios` fallback: WhatsApp has no
 * pre-migration users, so every role (owner included) resolves via whatsapp_links.
 */

import { isMissingSchemaArtifactError } from "./errors.ts";
import { can, type MemberPermissions } from "./permissions.ts";
import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  type TelegramLinkRecord,
  type TelegramSupabaseLike,
  type TelegramDashboardRole,
} from "./telegramAccess.ts";

/** Same shape as TelegramLinkRecord — the link record is channel-neutral. */
export type WhatsAppLinkRecord = TelegramLinkRecord;

/** Resolve a WhatsApp phone (wa_id) to an active dashboard link, or null. */
export async function resolveWhatsAppIdentityByPhone(
  supabase: TelegramSupabaseLike,
  phone: string,
): Promise<WhatsAppLinkRecord | null> {
  try {
    const { data: linkRows, error: linkError } = await supabase
      .from("whatsapp_links")
      .select("id, app_user_id, dashboard_id, whatsapp_name, status")
      .eq("whatsapp_phone", phone)
      .eq("status", "active")
      .limit(1);

    if (linkError) {
      if (isMissingSchemaArtifactError(linkError)) return null;
      throw linkError;
    }

    const link = linkRows?.[0];
    if (!link) return null;

    const { data: memberRows, error: memberError } = await supabase
      .from("dashboard_members")
      .select("role, status, permissions")
      .eq("user_id", link.app_user_id)
      .eq("dashboard_id", link.dashboard_id)
      .limit(1);

    if (memberError) throw memberError;
    const member = memberRows?.[0];
    if (!member || member.status !== "active") return null;

    return {
      id: link.id,
      userId: link.app_user_id,
      dashboardId: link.dashboard_id,
      ownerUserId: null,
      role: member.role as TelegramDashboardRole,
      permissions: (member.permissions as MemberPermissions) ?? {},
      username: link.whatsapp_name ?? null,
      remindersEnabled: true,
      linkTokenExpiresAt: null,
    };
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}

// Channel-neutral helpers, re-exported under WhatsApp names for call-site clarity.
export const applyWhatsAppDataScope = applyTelegramDataScope;
export const buildWhatsAppWriteOwnership = buildTelegramWriteOwnership;

export type WhatsAppAction = Parameters<typeof can>[1];

/** Permission check for a resolved WhatsApp link (no ctx — pure). */
export function canWhatsAppDo(linked: WhatsAppLinkRecord, action: WhatsAppAction): boolean {
  const role = linked.role ?? (linked.ownerUserId && !linked.dashboardId ? "owner" : "viewer");
  return can(
    {
      role,
      permissions: linked.permissions ?? {},
      user_id: linked.userId ?? linked.ownerUserId ?? "",
    },
    action,
  );
}
