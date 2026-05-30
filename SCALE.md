# SCALE.md — runbook de escala

> Estado: **~20-50 usuarios (2026-05)**. La infra actual sobra para este volumen.
> Este archivo existe para que escalar el día de mañana **no sea caótico**: la lista
> ya está priorizada, con archivo/línea y con el **gatillo** que indica cuándo atacar cada cosa.
> Diagnóstico completo en Engram (#735–739).

## Regla de oro

**Nada se construye "por las dudas".** Cada ítem diferido tiene un gatillo medible.
Los sensores (abajo) te avisan cuándo se prende. Mientras no se cumpla un gatillo, **no escalar**.

## Sensores (ya instalados)

| Sensor | Qué mide | Dónde |
|--------|----------|-------|
| Load-test baseline | latencia warm de hoy (p50 ~167ms, p99 ~327ms) | `loadtest/baseline.sh` + `loadtest/README.md` |
| Alerta Cloud Run | memoria instancia > 70% sostenida → email | policy `10670669594594165284`, canal damianjure@gmail.com |

## Hecho ya (barato, no por escala)

- ✅ Cron recurrentes pre-filtra `is_active=true AND deleted_at IS NULL` en DB (antes escaneaba toda la tabla). `cronJobs/recurrentes.ts`.
- ✅ Fix forecast `next_run_at` null (proyección con recurrentes nuevos). `dashboard/forecast.ts`.

## Lista diferida — con gatillo

| Prioridad | Qué | Archivo(s) | Gatillo para EMPEZAR |
|-----------|-----|-----------|----------------------|
| **Riesgo 0** | Migrar estado en memoria (Maps de sesiones/rate-limit/OAuth) → Supabase/Redis. Habilita `max-instances>1`. | `server.ts`, `rateLimit.ts` | Necesitar `max-instances>1`: p99 autenticado >1s **o** picos reales >40 concurrentes |
| Pilar 3 | Gemini fuera del request | `routes/movimientos.ts`, `imageExtract.ts`, bot | Cuando el slot pool (80) se sature por extracciones |
| Pilar 3 | Encolar export de reportes (tabla Supabase + Scheduler, NO BullMQ) | `reportExports.ts`, `routes/informes.ts`, bot `reports.ts` | Cuando un export tarde >5s o falle seguido |
| Pilar 1 | Over-fetch `/saldos`: `SUM GROUP BY` en DB en vez de traer todas las filas | `bot/commands/movements.ts:246` | Cuando un dashboard pase ~5k movimientos **o** latencia de `/saldos` se note |
| Pilar 2 | Caché saldos/scope en Redis con invalidación por write | — | Mismo gatillo que `/saldos` |
| Pilar 1 | Índice compuesto `(dashboard_id, categoria, created_at) WHERE deleted_at IS NULL` | migración | **Cuando salga el rediseño** (va pegado al filtro de categoría, no a escala) |
| Pilar 1 | DROP de 3 índices single-col redundantes en `movimientos` (`categoria`, `empresa_nombre`, `created_at`) | migración | Oportunista — confirmar `idx_scan=0` en `pg_stat_user_indexes` primero |
| Pilar 2 | Realtime: gating/polling fallback | `hooks/dashboard/useDashboardData.ts` | Cuando te acerques al techo de conexiones del plan Supabase |
| Pilar 1 | Proyectar columnas en `SELECT *` (30+ sitios) | varios | Solo si el ancho de banda/memoria se nota |

## Cómo NO entra BullMQ/Celery

`max-instances=1` + `min-instances=0` = serverless scale-to-zero. BullMQ necesita Redis + worker
always-on → rompe el min=0 y mata el ahorro de ~$58/mes de los crons. La opción correcta para esta
infra es **tabla en Supabase drenada por Cloud Scheduler** (reusa el patrón `/api/crons/*` que ya existe).
