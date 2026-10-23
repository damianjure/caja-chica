-- pending_ai_queue_status_phase: queue items are no longer deleted or silently
-- dropped. Each item ends as `processed` (with what was saved) or `failed` (with
-- the reason), so the user can be shown a summary once the AI is back.
--   status       pending → processed | failed
--   processed_at when the item left `pending`
--   result       processed: { description, tipo, count } · failed: { reason }
--   seen_at      when the author saw the summary (web) or was notified (Telegram);
--                only seen or old items are purged.
-- Safe to apply before the code that uses it: existing rows default to `pending`.

ALTER TABLE pending_ai_queue
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result       jsonb,
  ADD COLUMN IF NOT EXISTS seen_at      timestamptz;

CREATE INDEX IF NOT EXISTS pending_ai_queue_status_idx
  ON pending_ai_queue (status, created_at);

CREATE INDEX IF NOT EXISTS pending_ai_queue_author_unseen_idx
  ON pending_ai_queue (owner_user_id, channel)
  WHERE status <> 'pending' AND seen_at IS NULL;
