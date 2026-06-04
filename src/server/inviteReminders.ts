// Invite reminder logic — runs as a daily cron (0 10 * * *).
// Queries pending invitations older than 3 days and re-sends reminder emails.
// Exports processInviteReminders() so it can be tested independently.

import {
  sendAppInvitationEmail,
  sendDashboardInvitationEmail,
} from "./email.js";

// Supabase client shape we actually need (minimal subset).
type SupabaseLike = {
  from(table: string): {
    select(cols: string): unknown;
    update(payload: Record<string, unknown>): unknown;
    [key: string]: unknown;
  };
};

export interface InviteReminderOpts {
  /** Override for app invitation email sender (for testing). */
  sendAppEmail?: (to: string, url: string) => Promise<void>;
  /** Override for dashboard invitation email sender (for testing). */
  sendDashboardEmail?: (
    to: string,
    url: string,
    role: string,
    inviterEmail: string,
  ) => Promise<void>;
  /** Base URL for constructing invite links (e.g. "https://caja-chica-bot.web.app"). */
  baseUrl?: string;
}

type AppInviteRow = {
  id: string;
  email: string;
  invite_token: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  last_reminder_at: string | null;
};

type DashInviteRow = AppInviteRow & {
  role?: string;
  invited_by_user_id?: string | null;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function needsReminder(row: AppInviteRow, now: Date): boolean {
  const created = new Date(row.created_at);
  if (now.getTime() - created.getTime() < THREE_DAYS_MS) return false;

  if (row.expires_at !== null && row.expires_at !== undefined) {
    const expires = new Date(row.expires_at);
    if (expires <= now) return false;
  }

  if (row.last_reminder_at !== null && row.last_reminder_at !== undefined) {
    const lastRemind = new Date(row.last_reminder_at);
    if (now.getTime() - lastRemind.getTime() < ONE_DAY_MS) return false;
  }

  return true;
}

export async function processInviteReminders(
  supabase: SupabaseLike,
  opts: InviteReminderOpts = {},
): Promise<{ sent: number }> {
  const sendApp = opts.sendAppEmail ?? sendAppInvitationEmail;
  const sendDash =
    opts.sendDashboardEmail ??
    ((to: string, url: string, role: string, inviterEmail: string, inviterDisplayName?: string | null) =>
      sendDashboardInvitationEmail(to, url, role, inviterEmail, undefined, undefined, inviterDisplayName));
  const baseUrl = opts.baseUrl ?? "";

  const now = new Date();
  let sent = 0;

  // ---- user_invitations (app-level) ----
  const appQuery = supabase
    .from("user_invitations")
    .select("id, email, invite_token, status, created_at, expires_at, last_reminder_at") as Promise<{
      data: AppInviteRow[] | null;
      error: unknown;
    }>;

  const { data: appRows, error: appError } = await appQuery;
  if (appError) {
    console.error("[inviteReminder] Failed to fetch user_invitations:", appError);
  }
  for (const row of appRows ?? []) {
    if (row.status !== "pending") continue;
    if (!needsReminder(row, now)) continue;
    try {
      const url = `${baseUrl}/?invite=${row.invite_token}`;
      await sendApp(row.email, url);
      const updateResult = await (
        supabase
          .from("user_invitations")
          .update({ last_reminder_at: now.toISOString() }) as Record<string, unknown> & {
            eq: (col: string, val: string) => Promise<{ error: unknown }>;
          }
      ).eq("id", row.id);
      if (updateResult?.error) {
        console.error("[inviteReminder] Failed to update last_reminder_at for app invite", row.id, updateResult.error);
      }
      sent++;
    } catch (err) {
      console.error("[inviteReminder] Failed for app invite", row.id, err);
    }
  }

  // ---- dashboard_invitations ----
  const dashQuery = supabase
    .from("dashboard_invitations")
    .select(
      "id, email, invite_token, role, invited_by_user_id, status, created_at, expires_at, last_reminder_at",
    ) as Promise<{ data: DashInviteRow[] | null; error: unknown }>;

  const { data: dashRows, error: dashError } = await dashQuery;
  if (dashError) {
    console.error("[inviteReminder] Failed to fetch dashboard_invitations:", dashError);
  }

  // Batch-resolve inviter identity from app_users
  const inviterIds = [...new Set(
    (dashRows ?? [])
      .map((r) => r.invited_by_user_id)
      .filter((id): id is string => typeof id === "string"),
  )];

  const inviterEmailMap: Record<string, string> = {};
  const inviterNameMap: Record<string, string> = {};
  if (inviterIds.length > 0) {
    try {
      const { data: userRows, error: userErr } = await (
        supabase
          .from("app_users")
          .select("user_id, email, display_name") as unknown as Promise<{
            data: Array<{ user_id: string; email: string; display_name?: string | null }> | null;
            error: unknown;
          }>
      );
      if (userErr) {
        console.error("[inviteReminder] Failed to fetch inviter emails:", userErr);
      }
      for (const u of userRows ?? []) {
        if (inviterIds.includes(u.user_id)) {
          inviterEmailMap[u.user_id] = u.email;
          if (u.display_name?.trim()) inviterNameMap[u.user_id] = u.display_name.trim();
        }
      }
    } catch (err) {
      console.error("[inviteReminder] Failed to fetch inviter emails:", err);
    }
  }

  for (const row of dashRows ?? []) {
    if (row.status !== "pending") continue;
    if (!needsReminder(row, now)) continue;
    try {
      const url = `${baseUrl}/?invite=${row.invite_token}`;
      const inviterEmail = (row.invited_by_user_id && inviterEmailMap[row.invited_by_user_id]) || "";
      const inviterDisplayName = (row.invited_by_user_id && inviterNameMap[row.invited_by_user_id]) || null;
      await sendDash(
        row.email,
        url,
        row.role ?? "viewer",
        inviterEmail,
        inviterDisplayName,
      );
      const updateResult = await (
        supabase
          .from("dashboard_invitations")
          .update({ last_reminder_at: now.toISOString() }) as Record<string, unknown> & {
            eq: (col: string, val: string) => Promise<{ error: unknown }>;
          }
      ).eq("id", row.id);
      if (updateResult?.error) {
        console.error("[inviteReminder] Failed to update last_reminder_at for dashboard invite", row.id, updateResult.error);
      }
      sent++;
    } catch (err) {
      console.error("[inviteReminder] Failed for dashboard invite", row.id, err);
    }
  }

  console.log(`[inviteReminder] Sent ${sent} reminders`);
  return { sent };
}
