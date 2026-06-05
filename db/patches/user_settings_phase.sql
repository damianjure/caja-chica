-- user_settings_phase.sql
-- Display name + configurable notification hour per user

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS notification_hour smallint DEFAULT 21
    CHECK (notification_hour >= 0 AND notification_hour <= 23);

-- Function: list sessions for a user (auth schema not exposed via REST)
CREATE OR REPLACE FUNCTION get_my_sessions(target_user_id uuid)
RETURNS TABLE (
  id        uuid,
  created_at timestamptz,
  not_after  timestamptz,
  user_agent text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth
AS $$
  SELECT s.id, s.created_at, s.not_after, s.user_agent
  FROM   auth.sessions s
  WHERE  s.user_id = target_user_id
  ORDER  BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_my_sessions(uuid) TO service_role;

-- Function: delete a single session (only the owner can delete their own)
CREATE OR REPLACE FUNCTION delete_user_session(target_session_id uuid, target_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth
AS $$
  DELETE FROM auth.sessions
  WHERE  id      = target_session_id
  AND    user_id = target_user_id;
$$;

GRANT EXECUTE ON FUNCTION delete_user_session(uuid, uuid) TO service_role;
