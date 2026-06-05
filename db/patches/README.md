# db/patches

Patches SQL **históricos**, aplicados a producción **a mano** (no por el Supabase CLI).
Se conservan como registro cronológico de cómo evolucionó el schema.

> ⚠️ **No los corras con `supabase db push`.** No son migraciones gestionadas por el CLI
> (esas viven en `supabase/migrations/`). Están acá solo como documentación/archivo.

El snapshot completo del schema está en [`../schema.sql`](../schema.sql).

El estado de aplicación de cada patch (✔ prod + fecha) está documentado en
[`../../CLAUDE.md`](../../CLAUDE.md), sección "Base de datos y SQL".
