-- pending_ai_queue: stores messages/photos/docs that arrived while Gemini was
-- unavailable. A drain cron processes them in batch when the AI comes back.
-- Channel 'telegram': text/photo/pdf from the Telegram bot.
-- Channel 'web':      text typed in CargaModal when the API returned 503.

CREATE TABLE pending_ai_queue (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id      uuid        REFERENCES dashboards(id) ON DELETE CASCADE,
  owner_user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  channel           text        NOT NULL CHECK (channel IN ('telegram', 'web')),
  -- Telegram-only fields
  chat_id           bigint,
  -- Message kind
  kind              text        NOT NULL CHECK (kind IN ('text', 'photo', 'pdf', 'album', 'web_text')),
  -- For text/web_text: the original user message
  text_content      text,
  -- For photo/pdf/album: Telegram file_id values (NOT file_path — those expire)
  file_ids          text[],
  -- Parallel array: MIME type for each entry in file_ids
  mime_types        text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Items are purged after 72h; file_ids from Telegram stay valid long enough
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  retry_count       int         NOT NULL DEFAULT 0,
  CONSTRAINT pending_ai_queue_has_scope
    CHECK (dashboard_id IS NOT NULL OR owner_user_id IS NOT NULL)
);

CREATE INDEX pending_ai_queue_scope_idx   ON pending_ai_queue (dashboard_id, channel, created_at);
CREATE INDEX pending_ai_queue_chat_idx    ON pending_ai_queue (chat_id)    WHERE chat_id IS NOT NULL;
CREATE INDEX pending_ai_queue_expires_idx ON pending_ai_queue (expires_at);

ALTER TABLE pending_ai_queue ENABLE ROW LEVEL SECURITY;

-- Owners and active dashboard members can see their own queue items (read-only
-- from the browser; writes go through the service-role backend only).
CREATE POLICY "users_view_own_queue" ON pending_ai_queue
  FOR SELECT USING (
    owner_user_id = auth.uid()
    OR dashboard_id IN (
      SELECT dashboard_id FROM dashboard_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
