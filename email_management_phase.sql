-- email_management_phase.sql
-- Creates email_settings (single-row config) and email_log (append-only attempt log).
-- Mirror style of maintenance_mode_phase.sql.
-- ⚠️  DO NOT apply to prod without explicit user approval (gated manual step).

-- ---------------------------------------------------------------------------
-- email_settings: single-row configuration for outgoing email sender
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_settings (
  id          integer PRIMARY KEY DEFAULT 1,
  from_email  text NOT NULL DEFAULT 'hola@damianjure.com',
  from_name   text NOT NULL DEFAULT 'Caja Chica',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Constraint: only one row allowed
ALTER TABLE email_settings ADD CONSTRAINT email_settings_single_row CHECK (id = 1);

-- Seed the single row (defaults match current env fallback values)
INSERT INTO email_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- RLS: deny-all for non-service-role (service role bypasses RLS).
-- Superadmin reads via Express with service_role key — NOT directly from the client.
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_settings_deny_all" ON email_settings;
CREATE POLICY "email_settings_deny_all"
  ON email_settings
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- email_log: append-only record of every email send attempt
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email         text NOT NULL,
  subject          text NOT NULL,
  email_type       text NOT NULL CHECK (email_type IN ('app_invite', 'dashboard_invite', 'test', 'reminder')),
  ok               boolean NOT NULL,
  brevo_message_id text,
  error_body       text,
  invitation_id    uuid,          -- nullable, informational (no hard FK — spans 2 invitation tables)
  sent_at          timestamptz NOT NULL DEFAULT now()
);

-- Index for listing by time (primary access pattern: ORDER BY sent_at DESC)
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at
  ON email_log (sent_at DESC);

-- Index for looking up log entries for a specific invitation
CREATE INDEX IF NOT EXISTS idx_email_log_invitation
  ON email_log (invitation_id)
  WHERE invitation_id IS NOT NULL;

-- RLS: deny-all for non-service-role. Superadmin reads via Express service_role.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log_deny_all" ON email_log;
CREATE POLICY "email_log_deny_all"
  ON email_log
  FOR ALL
  USING (false)
  WITH CHECK (false);
