-- notification_minute_phase.sql
-- Adds minute granularity to the daily reminder.
-- Pairs with notification_hour (already 0-23). Cron moves from hourly to per-minute.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS notification_minute smallint NOT NULL DEFAULT 0
  CHECK (notification_minute >= 0 AND notification_minute <= 59);
