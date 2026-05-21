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
}

type InviteRow = {
  id: string;
  email: string;
  invite_url: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  last_reminder_at: string | null;
  role?: string;
  inviter_email?: string;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function needsReminder(row: InviteRow, now: Date): boolean {
  const created = new Date(row.created_at);
  if (now.getTime() - created.getTime() < THREE_DAYS_MS) return false;

  if (row.expires_at !== null && row.expires_at !== undefined) {
    const expires = new Date(row.expires_at);
    if (expires <= now) return false; // already expired naturally
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
    ((to: string, url: string, role: string, inviterEmail: string) =>
      sendDashboardInvitationEmail(to, url, role, inviterEmail));

  const now = new Date();
  let sent = 0;

  // ---- user_invitations (app-level) ----
  const appQuery = supabase
    .from("user_invitations")
    .select("id, email, invite_url, status, created_at, expires_at, last_reminder_at") as Promise<{
      data: InviteRow[] | null;
      error: unknown;
    }>;

  const { data: appRows } = await appQuery;
  for (const row of appRows ?? []) {
    if (row.status !== "pending") continue;
    if (!needsReminder(row, now)) continue;
    try {
      await sendApp(row.email, row.invite_url);
      await (
        supabase
          .from("user_invitations")
          .update({ last_reminder_at: now.toISOString() }) as Record<string, unknown> & {
            eq: (col: string, val: string) => Promise<unknown>;
          }
      ).eq("id", row.id);
      sent++;
    } catch (err) {
      console.error("[inviteReminder] Failed for app invite", row.id, err);
    }
  }

  // ---- dashboard_invitations ----
  const dashQuery = supabase
    .from("dashboard_invitations")
    .select(
      "id, email, invite_url, role, inviter_email, status, created_at, expires_at, last_reminder_at",
    ) as Promise<{ data: InviteRow[] | null; error: unknown }>;

  const { data: dashRows } = await dashQuery;
  for (const row of dashRows ?? []) {
    if (row.status !== "pending") continue;
    if (!needsReminder(row, now)) continue;
    try {
      await sendDash(
        row.email,
        row.invite_url,
        row.role ?? "viewer",
        row.inviter_email ?? "",
      );
      await (
        supabase
          .from("dashboard_invitations")
          .update({ last_reminder_at: now.toISOString() }) as Record<string, unknown> & {
            eq: (col: string, val: string) => Promise<unknown>;
          }
      ).eq("id", row.id);
      sent++;
    } catch (err) {
      console.error("[inviteReminder] Failed for dashboard invite", row.id, err);
    }
  }

  console.log(`[inviteReminder] Sent ${sent} reminders`);
  return { sent };
}
