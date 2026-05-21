# Design: Recurrentes UI y Frecuencias

## Executive Summary

Backend helper `computeNextRun` + `relativeRunLabel` en módulo nuevo `src/server/recurrentes.ts`. Cinco endpoints REST en `app.ts` siguiendo el patrón soft-delete de empresas. Tab `RecurrentesTab.tsx` self-contained. Cron refactorizado con guard `is_active / deleted_at`. Migration aditiva. Chained PRs: Slice A (SQL + backend + bot + tests) → Slice B (frontend + api client).

---

## 1. SQL Migration — `recurrentes_ui_phase.sql`

```sql
-- Aditivo: no modifica filas existentes
ALTER TABLE recurrentes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE recurrentes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Índice parcial para el listado GET y el cron
CREATE INDEX IF NOT EXISTS idx_recurrentes_active
  ON recurrentes (dashboard_id, owner_user_id)
  WHERE deleted_at IS NULL AND is_active = true;
```

Rollback: `ALTER TABLE recurrentes DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS deleted_at;`

---

## 2. Helper `computeNextRun` — `src/server/recurrentes.ts`

```ts
export type Frecuencia = 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'anual';

export const FRECUENCIA_WHITELIST: Frecuencia[] = [
  'diario', 'semanal', 'quincenal', 'mensual', 'anual',
];

/**
 * Devuelve la próxima fecha de ejecución basada en last_processed.
 * Si last_processed es null → esta noche a las 08:00 UTC (como hace el cron actual).
 */
export function computeNextRun(frecuencia: Frecuencia, last_processed: Date | null): Date {
  if (last_processed === null) {
    // Nunca procesado: apuntar a esta noche / madrugada UTC
    const tonight = new Date();
    tonight.setUTCHours(8, 0, 0, 0);
    if (tonight < new Date()) {
      tonight.setUTCDate(tonight.getUTCDate() + 1);
    }
    return tonight;
  }

  const base = new Date(last_processed);

  switch (frecuencia) {
    case 'diario':
      base.setUTCDate(base.getUTCDate() + 1);
      return base;

    case 'semanal':
      base.setUTCDate(base.getUTCDate() + 7);
      return base;

    case 'quincenal':
      base.setUTCDate(base.getUTCDate() + 14);
      return base;

    case 'mensual':
      return addMonth(base, 1);

    case 'anual':
      return addMonth(base, 12);
  }
}

/**
 * Suma N meses respetando el último día del mes destino.
 * Ej: 2026-01-31 + 1 mes → 2026-02-28 (no 2026-03-03).
 */
function addMonth(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months, 1); // ir al día 1 del mes destino
  // Último día del mes destino
  const lastDay = new Date(result.getUTCFullYear(), result.getUTCMonth() + 1, 0).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}
```

**Decisión ADR-1**: `next_run_at` NO se persiste en DB. Se computa al servir `GET /api/recurrentes`. Motivo: evitar desync entre columna y lógica de cron; la fuente de verdad es `last_processed + frecuencia`. Alternativa rechazada: columna `next_run_at` con trigger — complejidad sin beneficio para el volumen esperado.

---

## 3. Helper `relativeRunLabel` — `src/server/recurrentes.ts`

```ts
/**
 * Devuelve una etiqueta legible relativa a hoy.
 * next_run_at null → "se activa esta noche".
 */
export function relativeRunLabel(next_run_at: Date | null): string {
  if (!next_run_at) return 'se activa esta noche';

  const now = new Date();
  const diffMs = next_run_at.getTime() - now.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 0)  return 'hoy';
  if (days === 1) return 'mañana';
  if (days < 7)   return `en ${days} días`;
  if (days < 14)  return 'en 1 semana';
  if (days < 30)  return `en ${Math.floor(days / 7)} semanas`;
  if (days < 60)  return 'en 1 mes';
  if (days < 365) return `en ${Math.floor(days / 30)} meses`;
  if (days < 730) return 'en 1 año';
  return `en ${Math.floor(days / 365)} años`;
}
```

Umbrales exactos según spec:
- 0 → "hoy"
- 1 → "mañana"
- 2-6 → "en N días"
- 7-13 → "en 1 semana"
- 14-29 → "en N semanas" (floor de days/7)
- 30-59 → "en 1 mes"
- 60-364 → "en N meses"
- 365-729 → "en 1 año"
- 730+ → "en N años"

---

## 4. Validation — `src/server/validation.ts`

```ts
export interface RecurrenteRequest {
  monto: number;
  tipo: 'gasto' | 'ingreso';
  moneda: 'ARS' | 'USD';
  frecuencia: Frecuencia;
  categoria?: string;
  empresa_nombre?: string;
  descripcion?: string;
}

export function parseRecurrenteRequest(body: unknown): RecurrenteRequest {
  if (!body || typeof body !== 'object') throw new Error('Body inválido');
  const b = body as Record<string, unknown>;

  if (typeof b.monto !== 'number' || b.monto <= 0) throw new Error('monto inválido');
  if (b.tipo !== 'gasto' && b.tipo !== 'ingreso') throw new Error('tipo inválido');
  if (b.moneda !== 'ARS' && b.moneda !== 'USD') throw new Error('moneda inválida');
  if (!FRECUENCIA_WHITELIST.includes(b.frecuencia as Frecuencia)) {
    throw new Error('frecuencia inválida');
  }

  return {
    monto: b.monto,
    tipo: b.tipo,
    moneda: b.moneda as 'ARS' | 'USD',
    frecuencia: b.frecuencia as Frecuencia,
    categoria: typeof b.categoria === 'string' ? b.categoria : undefined,
    empresa_nombre: typeof b.empresa_nombre === 'string' ? b.empresa_nombre : 'Personal',
    descripcion: typeof b.descripcion === 'string' ? b.descripcion : undefined,
  };
}
```

Importar `Frecuencia` y `FRECUENCIA_WHITELIST` desde `./recurrentes`.

---

## 5. Endpoint Contracts — `src/server/app.ts`

### Scope resolver (patrón existente)

```ts
// Reutilizar getScopeFilter(session) que ya existe en app.ts para movimientos/empresas
// Retorna { dashboard_id } o { owner_user_id } según membresía activa
```

### GET /api/recurrentes

```ts
app.get('/api/recurrentes', requireSession, tierRead, async (req, res) => {
  const session = getSession(req);
  const scope = await getScopeFilter(supabase, session);

  const activeFilter = req.query.active;   // 'true' | 'false' | undefined
  const includeDeleted = req.query.include_deleted === 'true';

  let query = supabase.from('recurrentes').select('*');

  // Aplicar scope
  if ('dashboard_id' in scope) {
    query = query.eq('dashboard_id', scope.dashboard_id);
  } else {
    query = query.eq('owner_user_id', scope.owner_user_id);
  }

  // Soft delete filter
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  // Active filter
  if (activeFilter === 'true')  query = query.eq('is_active', true);
  if (activeFilter === 'false') query = query.eq('is_active', false);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Derivar next_run_at y next_run_label en JS, luego ordenar asc
  const enriched = (data ?? [])
    .map(r => {
      const next_run_at = computeNextRun(r.frecuencia, r.last_processed ? new Date(r.last_processed) : null);
      return { ...r, next_run_at: next_run_at.toISOString(), next_run_label: relativeRunLabel(next_run_at) };
    })
    .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at));

  res.json(enriched);
});
```

### POST /api/recurrentes

```ts
app.post('/api/recurrentes', requireSession, tierWrite, async (req, res) => {
  const session = getSession(req);
  const membership = await getMembership(supabase, session); // null = owner legacy

  // Viewer bloqueado
  if (membership?.role === 'viewer') return res.status(403).json({ error: 'Sin permiso' });

  let parsed: RecurrenteRequest;
  try { parsed = parseRecurrenteRequest(req.body); }
  catch (e) { return res.status(400).json({ error: (e as Error).message }); }

  const scope = await getScopeFilter(supabase, session);

  const { data, error } = await supabase.from('recurrentes').insert({
    ...parsed,
    ...scope,
    is_active: true,
    deleted_at: null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
```

### PATCH /api/recurrentes/:id

```ts
app.patch('/api/recurrentes/:id', requireSession, tierWrite, async (req, res) => {
  const session = getSession(req);
  const membership = await getMembership(supabase, session);
  if (membership?.role === 'viewer') return res.status(403).json({ error: 'Sin permiso' });

  // Verificar ownership y que no esté borrado
  const { data: existing } = await supabase
    .from('recurrentes').select('*').eq('id', req.params.id).single();
  if (!existing || existing.deleted_at) return res.status(404).json({ error: 'No encontrado' });
  if (!ownsRecord(existing, session)) return res.status(403).json({ error: 'Sin permiso' });

  let parsed: Partial<RecurrenteRequest>;
  try { parsed = parseRecurrenteRequest({ ...existing, ...req.body }); }
  catch (e) { return res.status(400).json({ error: (e as Error).message }); }

  const { data, error } = await supabase
    .from('recurrentes').update(parsed).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
```

### PATCH /api/recurrentes/:id/toggle

```ts
app.patch('/api/recurrentes/:id/toggle', requireSession, tierWrite, async (req, res) => {
  const session = getSession(req);
  const membership = await getMembership(supabase, session);
  if (membership?.role === 'viewer') return res.status(403).json({ error: 'Sin permiso' });

  const { data: existing } = await supabase
    .from('recurrentes').select('*').eq('id', req.params.id).single();
  if (!existing || existing.deleted_at) return res.status(404).json({ error: 'No encontrado' });
  if (!ownsRecord(existing, session)) return res.status(403).json({ error: 'Sin permiso' });

  const { data, error } = await supabase
    .from('recurrentes')
    .update({ is_active: !existing.is_active })
    .eq('id', req.params.id)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
```

**Decisión ADR-2**: toggle NO toca `last_processed`. Pausar = skip en cron; reactivar retoma desde donde estaba. Alternativa rechazada: resetear `last_processed` al reactivar — implicaría insertar movimiento inmediatamente aunque el ciclo no se haya cumplido.

### DELETE /api/recurrentes/:id

```ts
app.delete('/api/recurrentes/:id', requireSession, tierWrite, async (req, res) => {
  const session = getSession(req);
  const membership = await getMembership(supabase, session);
  if (membership?.role === 'viewer') return res.status(403).json({ error: 'Sin permiso' });

  const { data: existing } = await supabase
    .from('recurrentes').select('*').eq('id', req.params.id).single();
  if (!existing || existing.deleted_at) return res.status(404).json({ error: 'No encontrado' });
  if (!ownsRecord(existing, session)) return res.status(403).json({ error: 'Sin permiso' });

  const { error } = await supabase
    .from('recurrentes').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
```

**Decisión ADR-3**: soft delete siguiendo el patrón de `empresas`. Hard delete descartado para mantener consistencia y posibilitar auditoría futura.

---

## 6. Cron Refactor — `server.ts`

Sección del loop existente en `server.ts` (aprox. línea 2129):

```ts
for (const r of recurrentes) {
  try {
    // NUEVO: guard is_active / deleted_at
    if (!r.is_active || r.deleted_at) continue;

    const now = new Date();
    const last = r.last_processed ? new Date(r.last_processed) : null;
    const daysSince = last ? (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

    let shouldProcess = false;

    switch (r.frecuencia) {
      case 'diario':
        shouldProcess = daysSince >= 1;
        break;
      case 'semanal':
        shouldProcess = daysSince >= 7;
        break;
      case 'quincenal':                // NUEVO
        shouldProcess = daysSince >= 14;
        break;
      case 'mensual': {
        if (!last) { shouldProcess = true; break; }
        // Comparación por fecha calendario, no por días (respeta meses cortos)
        const nextMonthly = addMonthCron(last, 1);
        shouldProcess = now >= nextMonthly;
        break;
      }
      case 'anual': {                  // NUEVO
        if (!last) { shouldProcess = true; break; }
        const nextAnnual = addMonthCron(last, 12);
        shouldProcess = now >= nextAnnual;
        break;
      }
    }

    if (!shouldProcess) continue;

    // ... insertar movimiento y actualizar last_processed (lógica existente sin cambios)
  } catch (err) {
    console.error(`[recurrentes cron] error procesando ${r.id}:`, err);
  }
}
```

`addMonthCron` es la misma lógica que `addMonth` de `recurrentes.ts`. Importar desde allí para evitar duplicación.

**Decisión ADR-4**: mensual/anual usan comparación de fecha calendario (`now >= nextDate`) en lugar de `daysSince >= N`. Motivo: febrero tiene 28 días; con días fijos un recurrente del 28/01 se procesaría el 25/02 en vez del 28/02. Alternativa rechazada: siempre usar días — produce drift acumulado en meses cortos.

---

## 7. Bot Session Type — `server.ts`

```ts
interface RecurrenceSession {
  step: 'monto' | 'tipo' | 'moneda' | 'frecuencia' | 'descripcion';
  monto?: number;
  tipo?: 'gasto' | 'ingreso';
  moneda?: 'ARS' | 'USD';
  frecuencia?: 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'anual';  // 2 nuevos
  descripcion?: string;
}
```

Inline keyboard en paso frecuencia (5 botones, 2 filas):

```ts
const frecuenciaKeyboard = {
  inline_keyboard: [
    [
      { text: 'Diario',    callback_data: 'rec_frec:diario' },
      { text: 'Semanal',   callback_data: 'rec_frec:semanal' },
      { text: 'Quincenal', callback_data: 'rec_frec:quincenal' },
    ],
    [
      { text: 'Mensual', callback_data: 'rec_frec:mensual' },
      { text: 'Anual',   callback_data: 'rec_frec:anual' },
    ],
  ],
};
```

Handler `callback_query` para `rec_frec:*` ya existe; solo agregar los 2 nuevos valores al switch/if.

---

## 8. Frontend Tab — `src/components/dashboard/tabs/RecurrentesTab.tsx`

### Props

```ts
interface RecurrentesTabProps {
  viewer: boolean;
  canWriteData: boolean;   // !viewer && (owner || editor)
  dashboardRole: string | null;
}
```

### Estado interno

```ts
const [recurrentes, setRecurrentes] = useState<Recurrente[]>([]);
const [loading, setLoading] = useState(true);
const [editing, setEditing] = useState<Recurrente | null>(null);
const [creating, setCreating] = useState(false);
```

### Layout

```
<div className="space-y-6">
  {/* Header */}
  <header className="flex items-center justify-between">
    <h2>Recurrentes</h2>
    {canWriteData && <button onClick={() => setCreating(true)}>Nuevo recurrente</button>}
  </header>

  {/* Empty state */}
  {!loading && recurrentes.length === 0 && (
    <PlaceholderPanel>
      Sin recurrentes. Creá el primero para automatizar cargas.
    </PlaceholderPanel>
  )}

  {/* Lista */}
  {recurrentes.map(r => <RecurrenteCard key={r.id} r={r} canWrite={canWriteData} ... />)}

  {/* Modal crear/editar */}
  {(creating || editing) && (
    <RecurrenteModal
      initial={editing}
      onClose={() => { setCreating(false); setEditing(null); }}
      onSaved={reload}
    />
  )}
</div>
```

### RecurrenteCard — contenido

- Badge tipo: `gasto` → rojo / `ingreso` → verde
- Badge estado: `is_active` → "Activo" verde / "Pausado" amarillo
- Monto + moneda, frecuencia capitalizada, empresa_nombre
- `next_run_label` con `title={formatAbsoluteDate(r.next_run_at)}` para tooltip nativo
- Acciones (solo si `canWriteData`): icono Play/Pause (toggle), Edit, Trash (soft delete)
- Confirmación de borrado: `window.confirm` o mini-modal inline

### RecurrenteModal — form fields

| Campo | Input | Requerido |
|-------|-------|-----------|
| monto | number | sí |
| tipo | select gasto/ingreso | sí |
| moneda | select ARS/USD | sí |
| frecuencia | select 5 opciones | sí |
| empresa_nombre | text | no (default Personal) |
| categoria | text | no |
| descripcion | text | no |

### Permisos en UI

- Si `viewer`: ocultar botón "Nuevo recurrente" + ocultar columna/bloque de acciones
- Si `!is_active`: icono Play (activar); si `is_active`: icono Pause (pausar)

---

## 9. DashboardApp Wiring — `src/DashboardApp.tsx`

```ts
// Línea ~67 — union de tabs
type DashboardTab = 'resumen' | 'empresas' | 'gastos' | 'ingresos' | 'informes' | 'movimientos' | 'recurrentes';

// Línea ~117 — VALID_TABS
const VALID_TABS = ['resumen', 'empresas', 'gastos', 'ingresos', 'informes', 'movimientos', 'recurrentes'] as const;

// BASE_TAB_CONFIG — agregar entrada
{
  id: 'recurrentes',
  label: 'Recurrentes',
  icon: Repeat,                        // import { Repeat } from 'lucide-react'
  description: 'Gastos e ingresos automáticos',
  allowedRoles: ['owner', 'editor', 'viewer'],
}

// renderActiveTab() — agregar case
case 'recurrentes':
  return (
    <RecurrentesTab
      viewer={membershipRole === 'viewer'}
      canWriteData={membershipRole !== 'viewer'}
      dashboardRole={membershipRole}
    />
  );
```

Import lazy: `const RecurrentesTab = lazy(() => import('./components/dashboard/tabs/RecurrentesTab'));`

---

## 10. API Client — `src/services/api.ts`

```ts
export type Frecuencia = 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'anual';

export interface Recurrente {
  id: string;
  monto: number;
  tipo: 'gasto' | 'ingreso';
  moneda: 'ARS' | 'USD';
  frecuencia: Frecuencia;
  empresa_nombre: string;
  categoria: string | null;
  descripcion: string | null;
  is_active: boolean;
  deleted_at: string | null;
  last_processed: string | null;
  next_run_at: string;       // derivado, ISO
  next_run_label: string;    // derivado, legible
  dashboard_id: string | null;
  owner_user_id: string | null;
  created_at: string;
}

export interface RecurrenteRequest {
  monto: number;
  tipo: 'gasto' | 'ingreso';
  moneda: 'ARS' | 'USD';
  frecuencia: Frecuencia;
  empresa_nombre?: string;
  categoria?: string;
  descripcion?: string;
}

export async function listRecurrentes(params?: { active?: boolean; include_deleted?: boolean }): Promise<Recurrente[]> {
  const qs = new URLSearchParams();
  if (params?.active !== undefined) qs.set('active', String(params.active));
  if (params?.include_deleted) qs.set('include_deleted', 'true');
  return apiFetch(`/api/recurrentes?${qs}`);
}

export async function createRecurrente(data: RecurrenteRequest): Promise<Recurrente> {
  return apiFetch('/api/recurrentes', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRecurrente(id: string, data: Partial<RecurrenteRequest>): Promise<Recurrente> {
  return apiFetch(`/api/recurrentes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function toggleRecurrente(id: string): Promise<Recurrente> {
  return apiFetch(`/api/recurrentes/${id}/toggle`, { method: 'PATCH' });
}

export async function deleteRecurrente(id: string): Promise<void> {
  return apiFetch(`/api/recurrentes/${id}`, { method: 'DELETE' });
}
```

---

## 11. Tests — `tests/recurrentes.test.ts`

Target: ~18 tests. Estructura:

```
computeNextRun
  - diario: +1 día
  - semanal: +7 días
  - quincenal: +14 días
  - mensual: +1 mes normal (2026-05-15 → 2026-06-15)
  - mensual edge: 2026-01-31 → 2026-02-28
  - anual: +12 meses (2026-05-15 → 2027-05-15)
  - null last_processed → retorna fecha futura (tonight)

relativeRunLabel
  - 0 días → "hoy"
  - 1 día → "mañana"
  - 3 días → "en 3 días"
  - 7 días → "en 1 semana"
  - 21 días → "en 3 semanas"
  - 30 días → "en 1 mes"
  - 60 días → "en 2 meses"
  - 365 días → "en 1 año"
  - null → "se activa esta noche"

GET /api/recurrentes
  - viewer puede listar (200)
  - sort by next_run_at asc
  - deleted excluido por default
  - ?active=false retorna solo pausados

POST /api/recurrentes
  - 201 con frecuencia quincenal
  - viewer → 403
  - frecuencia inválida → 400

PATCH /api/recurrentes/:id/toggle
  - activo → pausado (is_active false)
  - last_processed sin cambio

DELETE /api/recurrentes/:id
  - soft delete (deleted_at set)
  - doble delete → 404
```

---

## 12. Migration Plan (Deploy Order)

1. **Aplicar SQL** `recurrentes_ui_phase.sql` en prod Supabase (aditivo, sin downtime)
2. **Deploy backend** (Slice A PR): endpoints + helpers + cron guard + bot botones + tests
3. **Deploy frontend** (Slice B PR): RecurrentesTab + DashboardApp wiring + api.ts
4. **Smoke test**:
   - Crear recurrente mensual desde web → aparece en lista con `next_run_label`
   - Pausar → badge cambia a Pausado; cron no lo procesa
   - Activar → badge vuelve a Activo
   - Editar monto → persiste
   - Soft delete → desaparece del listado
   - Bot `/recurrente` → verificar botones Quincenal y Anual presentes

---

## 13. Review Workload Forecast

| Slice | Archivos | Líneas estimadas |
|-------|----------|-----------------|
| SQL migration | 1 archivo nuevo | ~15 |
| `src/server/recurrentes.ts` (helpers) | 1 archivo nuevo | ~80 |
| `src/server/app.ts` (5 endpoints) | existing | ~150 |
| `src/server/validation.ts` (RecurrenteRequest) | existing | ~40 |
| `server.ts` (cron + bot) | existing | ~50 |
| `tests/recurrentes.test.ts` | 1 archivo nuevo | ~300 |
| `src/components/dashboard/tabs/RecurrentesTab.tsx` | 1 archivo nuevo | ~350 |
| `src/DashboardApp.tsx` (wiring) | existing | ~25 |
| `src/services/api.ts` (client) | existing | ~60 |
| **Total** | | **~1070** |

**Chained PRs: SÍ** (supera 400 líneas).

- **Slice A (PR1)**: SQL + `recurrentes.ts` helpers + `app.ts` endpoints + `validation.ts` + `server.ts` cron/bot + `tests/recurrentes.test.ts` → ~635 líneas
- **Slice B (PR2)**: `RecurrentesTab.tsx` + `DashboardApp.tsx` wiring + `api.ts` client → ~435 líneas

Slice A es prerequisito de Slice B (frontend consume los endpoints).

---

## ADR Summary

| # | Decisión | Alternativa rechazada | Motivo |
|---|----------|----------------------|--------|
| 1 | `next_run_at` computado en GET, no persistido | Columna DB con trigger | Evita desync; volumen bajo no justifica columna |
| 2 | toggle NO resetea `last_processed` | Resetear al reactivar | Pausar = skip temporal; resetear causaría inserción inmediata |
| 3 | Soft delete con `deleted_at` | Hard delete | Consistencia con patrón empresas; auditoría futura posible |
| 4 | Mensual/anual por fecha calendario | Por días fijos | Evita drift en meses cortos (febrero 28 días) |
| 5 | Módulo `src/server/recurrentes.ts` nuevo | Todo en `app.ts` | Testabilidad pura de helpers sin levantar Express; reutilizable en cron |
