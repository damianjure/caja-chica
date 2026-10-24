export type RealtimeHealth = 'live' | 'down' | 'connecting';

/**
 * Maps a Supabase realtime channel status to what the dashboard shows. While
 * the channel is down, movements loaded from Telegram do not appear by
 * themselves, so the user has to be told the data may be stale.
 */
export function realtimeHealth(status: string): RealtimeHealth {
  if (status === 'SUBSCRIBED') return 'live';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'down';
  return 'connecting';
}
