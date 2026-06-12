-- dashboard_types_phase.sql — NO APLICADO TODAVÍA.
-- Tipo de dashboard (personal/pyme) + datos fiscales + dashboard activo del usuario.
-- El modelo multi-dashboard (dashboards + dashboard_members) ya existe; esto le
-- agrega el eje personal/pyme y el "dashboard activo" elegible (switcher).

ALTER TABLE public.dashboards
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'pyme')),
  ADD COLUMN IF NOT EXISTS cuit text,
  ADD COLUMN IF NOT EXISTS cuil text;

-- Los dashboards personales existentes (personal_for_user_id IS NOT NULL) quedan
-- type='personal' por el default. Las pymes se crean con type='pyme' desde la app.

-- Dashboard activo elegido por el usuario (switcher). NULL = usar el primario
-- (comportamiento actual). El resolver de scope lo respeta sólo si el usuario es
-- miembro activo de ese dashboard.
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS active_dashboard_id uuid REFERENCES public.dashboards(id) ON DELETE SET NULL;
