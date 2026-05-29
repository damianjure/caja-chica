// emailLog.ts — fire-and-forget email delivery log.
// Writes one row to email_log per send attempt.
// INVARIANT: write failure NEVER throws into or blocks the calling send path.

import type { SupabaseLike } from "./app.ts";
import type { EmailType } from "./email.ts";

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
