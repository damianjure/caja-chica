-- whatsapp_links_phase.sql
-- NO APLICADO TODAVÍA — se aplica junto con la plomería de Meta (Cloud API).
-- Espejo de telegram_multi_user_phase.sql: vínculos WhatsApp por número de
-- teléfono. A diferencia de Telegram, WhatsApp NO tiene flujo legacy `usuarios`
-- (no hay usuarios WhatsApp pre-migración), así que TODOS los roles —incluido
-- owner— se vinculan vía whatsapp_links.

-- 1. Tabla principal de vínculos WhatsApp (todos los roles)
CREATE TABLE IF NOT EXISTS whatsapp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone text NOT NULL,        -- wa_id (número en formato internacional sin +)
  whatsapp_name text,                  -- contacts[].profile.name del webhook
  dashboard_id uuid NOT NULL,
  app_user_id text NOT NULL,           -- app_users.user_id (Supabase auth user_id)
  status text NOT NULL DEFAULT 'pending_owner_confirm'
    CHECK (status IN ('pending_owner_confirm', 'active', 'revoked')),
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique: permite re-vincular después de revocar.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_links_phone_active_uniq
  ON whatsapp_links (whatsapp_phone)
  WHERE status != 'revoked';

CREATE INDEX IF NOT EXISTS whatsapp_links_dashboard_id_idx ON whatsapp_links(dashboard_id);
CREATE INDEX IF NOT EXISTS whatsapp_links_app_user_id_idx ON whatsapp_links(app_user_id);

ALTER TABLE whatsapp_links ENABLE ROW LEVEL SECURITY;
-- Solo service_role bypasses RLS. Sin policies para anon.

-- 2. Tokens de invitación one-shot para vincular un número a un dashboard (TTL 30 min)
CREATE TABLE IF NOT EXISTS whatsapp_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  dashboard_id uuid NOT NULL,
  target_user_id text NOT NULL,        -- app_users.user_id del miembro a vincular
  created_by_user_id text NOT NULL,    -- app_users.user_id del owner que genera
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'expired'))
);

CREATE INDEX IF NOT EXISTS whatsapp_invite_tokens_token_idx ON whatsapp_invite_tokens(token);
CREATE INDEX IF NOT EXISTS whatsapp_invite_tokens_dashboard_id_idx ON whatsapp_invite_tokens(dashboard_id);

ALTER TABLE whatsapp_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Nota: dashboard_members.permissions (JSONB granular) ya existe desde
-- telegram_multi_user_phase.sql — se reutiliza tal cual para WhatsApp.
