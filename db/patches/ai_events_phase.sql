-- ai_events_phase.sql — NO APLICADO TODAVÍA.
-- Registro de eventos de capacidad de Gemini para el insight de salud IA del
-- superadmin (¿estamos pegando el límite? ¿el fallback alcanza?).
-- Inerte hasta aplicar: recordAiEvent/getAiHealth tragan la tabla faltante.

CREATE TABLE IF NOT EXISTS public.ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,                       -- gemini:text | gemini:media | gemini:*-quota-exhausted
  kind text NOT NULL CHECK (kind IN ('text', 'media')),
  outcome text NOT NULL CHECK (outcome IN ('fallback_used', 'both_exhausted')),
  context jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS ai_events_created_at_idx ON public.ai_events (created_at DESC);

ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
-- Solo service_role (el backend) escribe/lee. Sin policies para anon.
