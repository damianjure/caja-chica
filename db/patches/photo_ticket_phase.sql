-- photo_ticket_phase.sql
-- Fase: soporte de fotos/tickets/facturas en el bot de Telegram
-- Aplicar en Supabase prod ANTES de deployar backend con esta feature.

-- 1. Agregar campo CUIT a empresas (opcional, nullable)
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS cuit text;

CREATE UNIQUE INDEX IF NOT EXISTS empresas_cuit_unique
  ON empresas (dashboard_id, cuit)
  WHERE cuit IS NOT NULL AND deleted_at IS NULL;

-- 2. Crear tabla pending_extractions para sesiones de confirmación/edición
CREATE TABLE IF NOT EXISTS pending_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  dashboard_id uuid REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  extracted_data jsonb NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('photo', 'pdf', 'handwritten', 'multi')),
  message_id bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_pending_extractions_chat_active
  ON pending_extractions (chat_id, expires_at)
  WHERE status = 'pending';

-- RLS: solo el service role puede operar (bot usa service role key)
ALTER TABLE pending_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_extractions_service_only
  ON pending_extractions
  USING (false)
  WITH CHECK (false);
