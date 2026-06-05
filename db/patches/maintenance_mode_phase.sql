-- maintenance_mode_phase.sql
-- Creates maintenance_windows table: single-row upsert pattern (id always = 1).
-- RLS: service role bypasses RLS; anon/authed are blocked by the deny-all policy.

-- Enums
DO $$ BEGIN
  CREATE TYPE maintenance_kind AS ENUM ('immediate', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_state AS ENUM ('none', 'scheduled', 'grace', 'active', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id                       integer PRIMARY KEY DEFAULT 1,
  status                   text NOT NULL DEFAULT 'none'
                             CHECK (status IN ('none', 'scheduled', 'grace', 'active', 'ended', 'cancelled')),
  started_at               timestamptz,
  scheduled_at             timestamptz,
  grace_ends_at            timestamptz,
  estimated_end_at         timestamptz,
  message                  text,
  notification_sent_30min  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Constraint: only one row allowed
ALTER TABLE maintenance_windows ADD CONSTRAINT maintenance_windows_single_row CHECK (id = 1);

-- Seed the single row
INSERT INTO maintenance_windows (id, status)
VALUES (1, 'none')
ON CONFLICT (id) DO NOTHING;

-- Index for cron: find scheduled/grace windows quickly
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_cron
  ON maintenance_windows (status, scheduled_at)
  WHERE status IN ('scheduled', 'grace');

-- RLS
ALTER TABLE maintenance_windows ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (status endpoint is public)
DROP POLICY IF EXISTS "maintenance_read_public" ON maintenance_windows;
CREATE POLICY "maintenance_read_public"
  ON maintenance_windows
  FOR SELECT
  USING (true);

-- Deny all writes for non-service-role callers (service role bypasses RLS)
DROP POLICY IF EXISTS "maintenance_write_service_role_only" ON maintenance_windows;
CREATE POLICY "maintenance_write_service_role_only"
  ON maintenance_windows
  FOR ALL
  USING (false)
  WITH CHECK (false);
