-- recurrentes_ui_phase.sql
-- Additive migration: add is_active and deleted_at columns to recurrentes table
-- Existing rows automatically get is_active=true and deleted_at=null (no data loss)

ALTER TABLE recurrentes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE recurrentes ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Partial index for fast cron + API queries filtering active, non-deleted recurrentes
CREATE INDEX IF NOT EXISTS idx_recurrentes_active
  ON recurrentes (dashboard_id, owner_user_id)
  WHERE deleted_at IS NULL AND is_active = true;
