-- telegram_multi_user_phase.sql
-- Aplicar en Supabase prod ANTES de deployar el backend.
-- Crea tabla de vínculos Telegram para editor/viewer (flujo doble-factor).
-- Owners siguen usando tabla `usuarios` (flujo legacy one-shot).

-- 1. Tabla principal de vínculos Telegram (editor/viewer — flujo nuevo)
CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  dashboard_id uuid NOT NULL,
  app_user_id text NOT NULL,           -- references app_users.user_id (Supabase auth user_id)
  status text NOT NULL DEFAULT 'pending_owner_confirm'
    CHECK (status IN ('pending_owner_confirm', 'active', 'revoked')),
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique: permite re-vincular después de revocar (status='revoked' puede repetir)
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_telegram_user_id_active_uniq
  ON telegram_links (telegram_user_id)
  WHERE status != 'revoked';

CREATE INDEX IF NOT EXISTS telegram_links_dashboard_id_idx ON telegram_links(dashboard_id);
CREATE INDEX IF NOT EXISTS telegram_links_app_user_id_idx ON telegram_links(app_user_id);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
-- Solo service_role bypasses RLS. No policies para anon.

-- 2. Tokens de invitación one-shot para vincular editor/viewer a Telegram (TTL 30 min)
CREATE TABLE IF NOT EXISTS telegram_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  dashboard_id uuid NOT NULL,
  target_user_id text NOT NULL,        -- app_users.user_id del miembro a vincular
  created_by_user_id text NOT NULL,    -- app_users.user_id del owner que genera
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'expired'))
);

CREATE INDEX IF NOT EXISTS telegram_invite_tokens_token_idx ON telegram_invite_tokens(token);
CREATE INDEX IF NOT EXISTS telegram_invite_tokens_dashboard_id_idx ON telegram_invite_tokens(dashboard_id);

ALTER TABLE telegram_invite_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Permisos granulares sobre editor en dashboard_members
-- Estructura del JSONB: { "delete_any": bool, "export_drive": bool, "invite_telegram": bool }
-- Solo aplica a role='editor'. Owners tienen todo. Viewers siempre solo lectura.
ALTER TABLE dashboard_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';

-- 4. Migración opcional: owners con Telegram ya vinculado → telegram_links (status=active)
-- El resolver en código hace fallback a usuarios automáticamente,
-- así que esta inserción es solo para consistencia. Idempotente.
INSERT INTO telegram_links (telegram_user_id, dashboard_id, app_user_id, status, linked_at)
SELECT
  u.chat_id,
  dm.dashboard_id,
  u.user_id,
  'active',
  COALESCE(u.linked_at, now())
FROM usuarios u
JOIN dashboard_members dm
  ON dm.user_id = u.user_id
  AND dm.role = 'owner'
  AND dm.status = 'active'
WHERE u.chat_id IS NOT NULL
  AND u.user_id IS NOT NULL
  AND u.dashboard_id IS NOT NULL
ON CONFLICT DO NOTHING;
