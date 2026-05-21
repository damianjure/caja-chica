-- unified_invitations_phase.sql
-- Adds columns required for the unified personas view and telegram pre-auth.
-- Apply once per environment.  Do NOT apply automatically — run manually after code deploy.

ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz NULL;

ALTER TABLE dashboard_invitations
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS telegram_preauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_invite_token_id uuid
    REFERENCES telegram_invite_tokens(id) ON DELETE SET NULL;

ALTER TABLE telegram_invite_tokens
  ADD COLUMN IF NOT EXISTS pre_authorized boolean NOT NULL DEFAULT false;

-- Partial indexes to speed up the daily reminder cron (only scans pending rows)
CREATE INDEX IF NOT EXISTS idx_user_invitations_reminder
  ON user_invitations (status, created_at, last_reminder_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dashboard_invitations_reminder
  ON dashboard_invitations (status, created_at, last_reminder_at) WHERE status = 'pending';
