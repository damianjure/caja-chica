-- Profile identity + reminder channels (2026-06-03)
-- Additive migration. Safe to run multiple times.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS notification_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_telegram boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_users.profile_photo_url IS
  'Profile image URL captured from the auth provider when available. UI falls back to initials.';
COMMENT ON COLUMN public.app_users.notification_enabled IS
  'Master switch for the daily reminder.';
COMMENT ON COLUMN public.app_users.notification_telegram IS
  'Whether the daily reminder should be delivered via Telegram when linked.';
COMMENT ON COLUMN public.app_users.notification_email IS
  'Whether the daily reminder should be delivered via transactional email.';

CREATE INDEX IF NOT EXISTS idx_app_users_notifications_due
  ON public.app_users (notification_enabled, notification_hour, notification_minute)
  WHERE notification_enabled = true;
