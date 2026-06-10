import type { AppSession, DashboardMemberSummary, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

export async function syncPendingDashboardInvitations(
  supabase: SupabaseLike,
  session: AppSession,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("dashboard_invitations")
      .select("id, dashboard_id, role, invited_by_user_id, telegram_invite_token_id, expires_at")
      .eq("email", session.email.toLowerCase())
      .eq("status", "pending")
      .limit(50);
    if (error) throw error;

    const invitations = data ?? [];
    const now = Date.now();
    for (const invitation of invitations) {
      // Expired invitations stay status=pending in the DB (nothing flips them);
      // honoring them here would auto-accept stale invites on login.
      const expiresAt = (invitation as { expires_at?: string | null }).expires_at;
      if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
      await supabase
        .from("dashboard_members")
        .upsert(
          {
            dashboard_id: invitation.dashboard_id,
            user_id: session.userId,
            role: invitation.role,
            status: "active",
            invited_by_user_id: invitation.invited_by_user_id ?? null,
          },
          { onConflict: "dashboard_id,user_id" },
        );

      await supabase
        .from("dashboard_invitations")
        .update({
          status: "accepted",
          accepted_user_id: session.userId,
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id);

      // Backfill target_user_id on the pre-authorized telegram token (best-effort)
      if ((invitation as any).telegram_invite_token_id) {
        try {
          await supabase
            .from("telegram_invite_tokens")
            .update({ target_user_id: session.userId })
            .eq("id", (invitation as any).telegram_invite_token_id)
            .is("target_user_id", null)
            .eq("status", "pending");
        } catch (tokenErr) {
          console.error("[syncPendingDashboardInvitations] Failed to backfill telegram token target_user_id:", tokenErr);
        }
      }
    }
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }
}

export async function listDashboardMembers(
  supabase: SupabaseLike,
  dashboardId: string,
): Promise<DashboardMemberSummary[]> {
  const { data, error } = await supabase
    .from("dashboard_members")
    .select("id, user_id, role, status, created_at, permissions, app_users!dashboard_members_user_id_fkey(email, display_name, profile_photo_url)")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  const members = data ?? [];
  if (members.length === 0) return [];

  return members.map((member: any) => ({
    id: member.id,
    user_id: member.user_id,
    email: member.app_users?.email ?? null,
    display_name: member.app_users?.display_name ?? null,
    profile_photo_url: member.app_users?.profile_photo_url ?? null,
    role: member.role,
    status: member.status,
    created_at: member.created_at,
    permissions: (member.permissions as Record<string, boolean>) ?? {},
  }));
}
