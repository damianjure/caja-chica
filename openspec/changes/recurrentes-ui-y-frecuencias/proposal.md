# Proposal: Recurrentes en web + frecuencias quincenal/anual

## Intent

Hoy los movimientos recurrentes solo se crean desde el bot de Telegram (`/recurrente`). El dueño no puede ver qué se va a cargar mañana, no puede pausar sin perder la config, y no puede editar desde la app web. Además faltan frecuencias clave: quincenal (sueldos, alquileres prorrateados) y anual (seguros, dominios). Hace falta exponer recurrentes como tab web con CRUD completo + pausar, y sumar las dos frecuencias en bot y backend.

## Scope

### In Scope
- Tab "Recurrentes" en dashboard web (CRUD + pausar/activar + soft delete)
- `next_run` derivado en backend (no columna DB)
- Frecuencias `quincenal` (14d) y `anual` (365d) en backend + bot
- Migration aditiva: `is_active boolean default true`, `deleted_at timestamptz`
- Cron extendido con quincenal/anual + guard `is_active && !deleted_at`
- Permisos via `can()`: viewer solo lee, editor/owner CRUD
- Vocabulario unificado: Dueño / Puede editar / Puede ver

### Out of Scope
- Notificaciones cuando el cron genera un movimiento automático (fase 2)
- Edición masiva / bulk pause (fase 2)
- Export CSV/PDF del listado de recurrentes (fase 2)
- Histórico de movimientos generados por recurrente (open question)

## Capabilities

### New Capabilities
- `recurrentes`: CRUD web de movimientos recurrentes, pausar/activar, soft delete, cálculo de próxima carga derivado

### Modified Capabilities
- None (cron y bot son detalles de implementación; no hay specs previas para recurrentes)

## Approach

**Approach A (recomendado por exploración)**: `next_run` se calcula en backend al servir GET, no se persiste. Migration solo agrega `is_active` + `deleted_at` (soft delete pattern idéntico a empresas). Cron extiende switch de frecuencias y filtra `is_active && !deleted_at` ANTES de procesar. Endpoints REST estándar siguen patrón de movimientos. Tab self-contained con su propio data fetch (como ConfiguracionTab), no infla DashboardApp.tsx. Bot suma 2 botones al keyboard `rec_frec:*`.

Edge case mensual/anual: si el día no existe en el mes/año destino (ej: 31 → febrero), usar último día disponible.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `recurrentes_ui_phase.sql` | New | ALTER TABLE: is_active + deleted_at |
| `src/server/app.ts` | Modified | 5 endpoints nuevos (GET/POST/PATCH/PATCH toggle/DELETE) |
| `src/server/validation.ts` | Modified | RecurrenteRequest + whitelist frecuencia |
| `src/services/api.ts` | Modified | Recurrente interface + 5 métodos |
| `src/components/dashboard/tabs/RecurrentesTab.tsx` | New | Tab self-contained |
| `src/DashboardApp.tsx` | Modified | DashboardTab union + VALID_TABS + BASE_TAB_CONFIG + lazy import |
| `server.ts` | Modified | Cron: quincenal/anual + guard is_active; bot: 2 botones nuevos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cron procesa pausados si backend deploya antes que SQL | High | Deploy order: SQL → backend → frontend; checklist explícito |
| frecuencia text sin enum → valores inválidos | Med | Whitelist en validation.ts + tests negativos |
| Mensual/anual edge case (día 31) | Med | Spec: usar último día del mes destino |
| PR estimado >400 líneas | High | Chained PRs: Slice A backend+SQL, Slice B frontend |
| Bot session type union desfasado | Low | Test que cubra nueva frecuencia en flujo |

## Rollback Plan

1. Frontend: revert tab → ocultar de VALID_TABS (datos siguen vivos)
2. Backend: revert endpoints (cron sigue funcionando con guards)
3. Cron: revertir extensión deja quincenal/anual sin procesar pero no rompe diario/semanal/mensual
4. SQL: `ALTER TABLE recurrentes DROP COLUMN is_active, DROP COLUMN deleted_at` — aditivo, sin pérdida de datos en columnas core

## Dependencies

- Strict TDD activo (Node native test runner)
- Patrón soft delete idéntico a empresas (referencia para SQL)
- `can()` helper existente para permisos

## Success Criteria

- [ ] Tab "Recurrentes" visible junto a otras tabs
- [ ] Listado muestra monto, tipo, frecuencia, próxima carga
- [ ] Crear desde web → cron lo procesa al día siguiente
- [ ] Pausar detiene generación; activar la reanuda sin perder config
- [ ] Soft delete oculta de listado y de cron
- [ ] Bot `/recurrente` ofrece quincenal y anual
- [ ] Viewer no ve botones de edición
- [ ] Tests verdes (~220 total)

## Open Questions

- ¿"Próxima carga" en formato relativo ("mañana") o absoluto ("21/05/2026")? → propuesta: ambos (relativo + tooltip absoluto)
- ¿Pausar resetea `last_processed`? → propuesta: NO, solo skip en cron
- ¿Mostrar histórico de movimientos generados por cada recurrente? → diferido a fase 2
