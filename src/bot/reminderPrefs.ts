type SupabaseLike = { from(t: string): any };

export interface ReminderState {
  enabled: boolean;
  telegram: boolean;
  email: boolean;
  hour: number;
  minute: number;
}

export async function readReminder(supabase: SupabaseLike, userId: string): Promise<ReminderState> {
  const { data } = await supabase
    .from("app_users")
    .select("notification_enabled, notification_telegram, notification_email, notification_hour, notification_minute")
    .eq("user_id", userId)
    .single();
  return {
    enabled: data?.notification_enabled ?? true,
    telegram: data?.notification_telegram ?? true,
    email: data?.notification_email ?? false,
    hour: data?.notification_hour ?? 21,
    minute: data?.notification_minute ?? 0,
  };
}

export async function writeReminder(
  supabase: SupabaseLike,
  userId: string,
  patch: Partial<{ enabled: boolean; telegram: boolean; email: boolean; hour: number; minute: number }>,
): Promise<void> {
  const map: Record<string, string> = {
    enabled: "notification_enabled",
    telegram: "notification_telegram",
    email: "notification_email",
    hour: "notification_hour",
    minute: "notification_minute",
  };
  const dbPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) dbPatch[map[k]] = v;
  if (Object.keys(dbPatch).length === 0) return;
  await supabase.from("app_users").update(dbPatch).eq("user_id", userId);
}
