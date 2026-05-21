# Tasks: Recurrentes UI y Frecuencias

**Delivery:** stacked-to-main · 2 chained PRs · Strict TDD (`node --import tsx --test tests/**/*.test.ts`)

---

## Slice A — Backend (PR1) · ~635 líneas

### A.1 · Escribir SQL migration `recurrentes_ui_phase.sql`
- [ ] Crear `/Users/damian/Dev/Boteado/recurrentes_ui_phase.sql`
  - `ALTER TABLE recurrentes ADD COLUMN is_active boolean NOT NULL DEFAULT true`
  - `ALTER TABLE recurrentes ADD COLUMN deleted_at timestamptz NULL`
  - Índice parcial: `CREATE INDEX idx_recurrentes_active ON recurrentes (owner_user_id, dashboard_id) WHERE deleted_at IS NULL AND is_active = true`
- **Archivos:** `/Users/damian/Dev/Boteado/recurrentes_ui_phase.sql`
- **Verify:** sintaxis válida (`\i` sin error); `DEFAULT true` garantiza que filas existentes tienen `is_active=true`, `deleted_at=NULL` sin UPDATE explícito
- **Paralelo con A.2** ✓

---

### A.2 · Tests RED — helpers `computeNextRun` + `relativeRunLabel`
- [ ] Crear `tests/recurrentes.test.ts` con casos que DEBEN FALLAR (módulo no existe aún):
  - `computeNextRun(null, 'mensual')` → medianoche de hoy
  - `computeNextRun('2026-05-21', 'diario')` → 2026-05-22T00:00:00Z
  - `computeNextRun('2026-05-21', 'semanal')` → 2026-05-28T00:00:00Z
  - `computeNextRun('2026-05-21', 'quincenal')` → 2026-06-05T00:00:00Z
  - `computeNextRun('2026-05-21', 'mensual')` → 2026-06-21T00:00:00Z
  - `computeNextRun('2026-05-21', 'anual')` → 2027-05-21T00:00:00Z
  - Edge: `computeNextRun('2026-01-31', 'mensual')` → 2026-02-28T00:00:00Z (clamp último día)
  - Edge: `computeNextRun('2024-02-29', 'anual')` → 2025-02-28T00:00:00Z (bisiesto → no bisiesto)
  - `relativeRunLabel` umbrales: hoy → `"se activa esta noche"`, ≤7 días → `"en N días"`, ≤30 → `"en N días"`, >30 → `"en N días"`
- **Archivos:** `/Users/damian/Dev/Boteado/tests/recurrentes.test.ts`
- **Verify:** `node --import tsx --test tests/recurrentes.test.ts` → todos FAIL con "Cannot find module"
- **Paralelo con A.1** ✓

---

### A.3 · Implementar `src/server/recurrentes.ts`
- [ ] Crear módulo con exports puros (sin Express, sin Supabase):
  - `FRECUENCIA_WHITELIST: readonly string[]` = `['diario','semanal','quincenal','mensual','anual']`
  - `addMonth(date: Date, months: number): Date` — clamp al último día del mes destino
  - `computeNextRun(lastProcessed: string | null, frecuencia: string, now?: Date): Date`
  - `relativeRunLabel(nextRun: Date, now?: Date): string`
- **Archivos:** `/Users/damian/Dev/Boteado/src/server/recurrentes.ts`
- **Verify:** `node --import tsx --test tests/recurrentes.test.ts` → todos los tests A.2 PASS

---

### A.4 · Tests RED — endpoints CRUD recurrentes
- [ ] Ampliar `tests/recurrentes.test.ts` con casos de integración HTTP que deben FALLAR:
  - `GET /api/recurrentes` — owner: 200 + array ordenado por `next_run_at` asc
  - `GET /api/recurrentes?active=false` — solo pausados
  - `GET /api/recurrentes` — viewer: 200 (puede listar)
  - `POST /api/recurrentes` — body válido + frecuencia='quincenal': 201, `is_active=true`
  - `POST /api/recurrentes` — viewer: 403
  - `POST /api/recurrentes` — `frecuencia='trimestral'`: 400
  - `PATCH /api/recurrentes/:id` — monto edit: 200, campo cambiado
  - `PATCH /api/recurrentes/:id` — recurrente con `deleted_at` seteado: 404
  - `PATCH /api/recurrentes/:id/toggle` — invertir is_active, `last_processed` intacto
  - `PATCH /api/recurrentes/:id/toggle` — viewer: 403
  - `DELETE /api/recurrentes/:id` — editor: 200, desaparece del GET default
  - `DELETE /api/recurrentes/:id` — doble delete: 404
- **Archivos:** `/Users/damian/Dev/Boteado/tests/recurrentes.test.ts`
- **Verify:** tests FAIL con 404 "route not found"
- **Paralelo con A.5** ✓

---

### A.5 · Validation — `RecurrenteRequest` + `parseRecurrenteRequest`
- [ ] Agregar a `src/server/validation.ts`:
  - Interface `RecurrenteRequest { monto: number; tipo: 'gasto'|'ingreso'; moneda: 'ARS'|'USD'; frecuencia: Frecuencia; categoria?: string; empresa_nombre?: string; descripcion?: string }`
  - `parseRecurrenteRequest(body: unknown): RecurrenteRequest` — valida monto > 0, tipo/moneda/frecuencia en whitelist, throws 400-compatible error si inválido
- **Archivos:** `/Users/damian/Dev/Boteado/src/server/validation.ts`
- **Verify:** lint limpio; test `frecuencia='trimestral'` produce error 400 en unit test
- **Paralelo con A.4** ✓

---

### A.6 · Implementar 5 endpoints en `src/server/app.ts`
- [ ] Agregar rutas siguiendo el patrón soft-delete de empresas:
  - `GET /api/recurrentes` — scope resolver + filtro `deleted_at IS NULL` por defecto + `?active` + `?include_deleted` + sort `next_run_at` asc (computed) + `next_run_label`
  - `POST /api/recurrentes` — viewer 403, parseRecurrenteRequest, insert con `is_active=true`
  - `PATCH /api/recurrentes/:id` — viewer 403, scope guard, deleted 404, update fields
  - `PATCH /api/recurrentes/:id/toggle` — viewer 403, scope guard, deleted 404, invert `is_active`, NO tocar `last_processed`
  - `DELETE /api/recurrentes/:id` — viewer 403, scope guard, deleted 404, set `deleted_at=now()`
- **Archivos:** `/Users/damian/Dev/Boteado/src/server/app.ts`
- **Verify:** tests A.4 pasan GREEN; no regresión en suite existente

---

### A.7 · Cron refactor en `server.ts`
- [ ] En la query de recurrentes del cron `0 8 * * *`:
  - Agregar filtro `.eq('is_active', true).is('deleted_at', null)` (usar `.is()` no `.eq()`)
  - Agregar case `'quincenal'`: umbral 14 días
  - Agregar case `'anual'`: umbral 365 días con `addMonth(lastDate, 12)` para siguiente procesamiento
  - Edge mensual/anual: reemplazar `new Date(year, month+1, day)` por `addMonth()` con clamp
- **Archivos:** `/Users/damian/Dev/Boteado/server.ts`
- **Verify:** recurrente con `is_active=false` no genera movimiento en test mock; quincenal respeta 14 días

---

### A.8 · Bot inline keyboard: agregar quincenal + anual
- [ ] En handler `/recurrente`, paso de frecuencia:
  - Ampliar `InlineKeyboard` de 3 a 5 botones: Diario · Semanal · Quincenal · Mensual · Anual
  - Agregar cases en `callbackQuery` handler para `'quincenal'` y `'anual'`
  - Validar que `'diario'`, `'semanal'`, `'mensual'` siguen funcionando exactamente igual
- **Archivos:** `/Users/damian/Dev/Boteado/server.ts`
- **Verify:** teclado muestra 5 botones; unit tests de bot no fallan

---

### A.9 · Full test suite verde + lint (PR1 gate)
- [ ] Correr `node --import tsx --test tests/**/*.test.ts` → target ~225 tests, **0 fail**
- [ ] Correr `npm run lint` → **0 errores**
- **Verify:** output numérico confirma count; resumen final "0 failing"

---

### A.10 · [DEPLOY — fuera de apply] SQL prod via MCP supabase
- [ ] Ejecutar `recurrentes_ui_phase.sql` contra proyecto `dezgusgxotihxkfkxico` via MCP supabase
- **Verify:** `information_schema.columns` muestra `is_active` y `deleted_at` en tabla `recurrentes`; filas existentes tienen `is_active=true`, `deleted_at=null`

---

## Slice B — Frontend (PR2) · ~435 líneas

> Prerequisito: PR1 mergeado a main · SQL prod aplicado

### B.1 · API client — tipos + 5 métodos en `src/services/api.ts`
- [x] Agregar:
  - `type Frecuencia = 'diario'|'semanal'|'quincenal'|'mensual'|'anual'`
  - `interface Recurrente { id: string; monto: number; tipo: 'gasto'|'ingreso'; moneda: 'ARS'|'USD'; frecuencia: Frecuencia; empresa_nombre: string; descripcion?: string; categoria?: string; is_active: boolean; deleted_at: string|null; next_run_at: string; next_run_label: string }`
  - `listRecurrentes(params?: { active?: boolean; include_deleted?: boolean }): Promise<Recurrente[]>`
  - `createRecurrente(data: Omit<Recurrente,'id'|'is_active'|'deleted_at'|'next_run_at'|'next_run_label'>): Promise<Recurrente>`
  - `updateRecurrente(id: string, data: Partial<...>): Promise<Recurrente>`
  - `toggleRecurrente(id: string): Promise<Recurrente>`
  - `deleteRecurrente(id: string): Promise<void>`
- **Archivos:** `/Users/damian/Dev/Boteado/src/services/api.ts`
- **Verify:** `tsc --noEmit` pasa sin errores en api.ts

---

### B.2 · Crear `RecurrentesTab.tsx`
- [x] Crear componente self-contained con:
  - Props: `{ viewer: boolean; canWriteData: boolean }`
  - Lista/tabla: monto, tipo (badge Gasto/Ingreso), frecuencia, empresa, `next_run_label` con `title={DD/MM/YYYY}` para tooltip nativo, badge Activo/Pausado con contraste dark-mode (igual que PersonasPanel)
  - Acciones por fila (ocultas si `viewer`): botón Pausar/Activar (toggle), Editar (abre modal), Borrar (soft delete con confirm)
  - Botón "Nuevo recurrente" visible solo si `!viewer` — abre modal form
  - Modal form: monto (number input), tipo (select), moneda (select), frecuencia (select 5 opciones), empresa_nombre (text, default 'Personal'), descripcion (text optional)
  - Empty state: `"Sin recurrentes. Creá el primero para automatizar cargas."`
  - Loading state mientras fetch
- **Archivos:** `/Users/damian/Dev/Boteado/src/components/dashboard/tabs/RecurrentesTab.tsx`
- **Verify:** TypeScript compila; viewer no ve acciones; empty state renderiza sin crash

---

### B.3 · DashboardApp wiring
- [x] En `src/DashboardApp.tsx`:
  - Ampliar union type de tabs con `'recurrentes'`
  - Agregar a `VALID_TABS`
  - Agregar a `BASE_TAB_CONFIG`: label `"Recurrentes"`, icon `Repeat` (lucide-react)
  - Lazy import `RecurrentesTab`
  - Agregar case en `renderActiveTab` pasando `viewer` y `canWriteData`
- **Archivos:** `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`
- **Verify:** tab aparece en nav; click navega sin crash; lazy chunk carga sin error en consola

---

### B.4 · Lint clean (PR2 gate)
- [x] `npm run lint` → **0 errores**
- **Verify:** output limpio

---

## Deploy final (fuera de apply)

### F.1 · Deploy backend Cloud Run
```bash
gcloud config set project caja-chica-bot
gcloud builds submit --tag gcr.io/caja-chica-bot/caja-chica --region us-west2
gcloud run deploy caja-chica --image gcr.io/caja-chica-bot/caja-chica --region us-west2 --platform managed --quiet
```

### F.2 · Deploy frontend Firebase Hosting
```bash
npm run build
firebase use caja-chica-bot
firebase deploy --only hosting
```

### F.3 · Smoke test end-to-end
- [ ] Crear recurrente quincenal → ver `next_run_label = "en 15 días"` (aprox)
- [ ] Pausar → badge cambia a "Pausado"
- [ ] Reactivar → badge vuelve a "Activo"
- [ ] Editar monto → valor actualizado en lista
- [ ] Soft delete → desaparece del listado

---

## Parallelism map

```
A.1 ─┐
     ├─→ A.3 ─→ A.4 ─┐
A.2 ─┘              ├─→ A.6 ─→ A.7 ─→ A.8 ─→ A.9 → A.10
A.5 ────────────────┘

[PR1 mergeado]

B.1 ─→ B.2 ─→ B.3 ─→ B.4 → F.1 → F.2 → F.3
```

- A.1 y A.2 paralelos ✓
- A.4 y A.5 paralelos ✓
- Slice B completo secuencial entre sí, pero el slice entero va después de PR1

---

## Review Workload Forecast

| Metric | Slice A (PR1) | Slice B (PR2) |
|--------|---------------|---------------|
| Líneas estimadas | ~635 | ~435 |
| Budget 400-line risk | **Alto** (supera con tests) | Moderado |
| Chained PRs recomendado | **Sí** | — (es el segundo) |
| Decision needed | Ya tomada: stacked-to-main | — |

**Delivery strategy:** `ask-on-risk` → chained confirmado → `stacked-to-main`.
