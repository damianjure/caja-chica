// emailLog.ts — fire-and-forget email delivery log.
// Writes one row to email_log per send attempt.
// INVARIANT: write failure NEVER throws into or blocks the calling send path.

import type { SupabaseLike } from "./app.ts";
import type { EmailType } from "./email.ts";

// ---------------------------------------------------------------------------
// EmailLogRow — shape returned by listEmailLog
// ---------------------------------------------------------------------------

export interface EmailLogRow {
  id: string;
  to_email: string;
  subject: string;
  email_type: EmailType;
  ok: boolean;
  brevo_message_id: string | null;
  error_body: string | null;
  sent_at: string;
}

export interface EmailLogFilters {
  type?: EmailType;
  ok?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  before?: string;
}

export async function listEmailLog(
  supabase: SupabaseLike,
  filters: EmailLogFilters = {},
): Promise<EmailLogRow[]> {
  let query = (supabase as any)
    .from("email_log")
    .select("id, to_email, subject, email_type, ok, brevo_message_id, error_body, sent_at")
    .order("sent_at", { ascending: false });

  if (filters.type !== undefined) query = query.eq("email_type", filters.type);
  if (filters.ok !== undefined) query = query.eq("ok", filters.ok);
  if (filters.from) query = query.gte("sent_at", filters.from);
  if (filters.to) query = query.lte("sent_at", filters.to);
  if (filters.before) query = query.lt("sent_at", filters.before);

  const limit = Math.max(1, Math.min(500, filters.limit ?? 100));
  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`[emailLog] listEmailLog failed: ${error.message ?? JSON.stringify(error)}`);
  }

  return (data ?? []) as EmailLogRow[];
}

export interface WriteEmailLogParams {
  supabase: SupabaseLike;
  toEmail: string;
  subject: string;
  emailType: EmailType;
  ok: boolean;
  messageId?: string;
  errorBody?: string;
  invitationId?: string | null;
}

export async function writeEmailLog(params: WriteEmailLogParams): Promise<void> {
  const { supabase, toEmail, subject, emailType, ok, messageId, errorBody, invitationId } = params;

  try {
    const row: Record<string, unknown> = {
      to_email: toEmail,
      subject,
      email_type: emailType,
      ok,
    };

    if (messageId !== undefined) row.brevo_message_id = messageId;
    if (errorBody !== undefined) row.error_body = errorBody;
    if (invitationId != null) row.invitation_id = invitationId;

    const { error } = await (supabase as any)
      .from("email_log")
      .insert(row);

    if (error) {
      console.error("[emailLog] Failed to write email_log row:", error.message ?? error);
    }
  } catch (err) {
    // INVARIANT #2: log failure must NEVER bubble up to the send path.
    console.error("[emailLog] writeEmailLog threw:", err);
  }
}
