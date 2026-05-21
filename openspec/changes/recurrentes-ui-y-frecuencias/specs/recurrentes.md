# Recurrentes — Especificación

## Purpose

Exponer CRUD web para movimientos recurrentes, extender el cron con frecuencias quincenal y anual, y sumar esas frecuencias al bot. La tabla `recurrentes` recibe dos columnas aditivas: `is_active` y `deleted_at`.

---

## Requirements

### Requirement: Migración aditiva de tabla recurrentes

La base de datos MUST recibir `is_active boolean NOT NULL DEFAULT true` y `deleted_at timestamptz NULL` en la tabla `recurrentes` sin modificar filas existentes ni romper el cron actual.

#### Scenario: Registros existentes no se ven afectados

- GIVEN la tabla `recurrentes` tiene filas previas a la migración
- WHEN se aplica `recurrentes_ui_phase.sql`
- THEN todas las filas existentes tienen `is_active = true` y `deleted_at = NULL`

---

### Requirement: GET /api/recurrentes

El endpoint MUST devolver los recurrentes del scope del caller (dashboard o owner legacy), ordenados por `next_run_at` ascendente. Cada item MUST incluir `next_run_at` (ISO timestamp derivado, nunca almacenado) y `next_run_label` (string relativo). Recurrentes con `deleted_at NOT NULL` MUST ser excluidos por defecto. Soporte filtros opcionales `?active=true|false` y `?include_deleted=true`.

#### Scenario: Listado básico

- GIVEN un owner con 3 recurrentes activos (1 mensual, 1 semanal, 1 anual)
- WHEN `GET /api/recurrentes`
- THEN responde 200 con array de 3 items ordenados por `next_run_at` asc, cada uno con `next_run_label`

#### Scenario: Recurrente sin last_processed

- GIVEN un recurrente recién creado con `last_processed = NULL`
- WHEN `GET /api/recurrentes`
- THEN `next_run_label` del item es `"se activa esta noche"` y `next_run_at` apunta a la medianoche de hoy

#### Scenario: Label relativo con tooltip

- GIVEN recurrente mensual con `last_processed = 2026-05-21`
- WHEN `GET /api/recurrentes` el 2026-05-22
- THEN `next_run_label = "en 30 días"` y `next_run_at = "2026-06-21T00:00:00Z"`

#### Scenario: Filtro active=false

- GIVEN 1 recurrente activo + 1 recurrente pausado
- WHEN `GET /api/recurrentes?active=false`
- THEN responde solo el recurrente pausado

#### Scenario: Viewer puede listar

- GIVEN un viewer logueado en el dashboard
- WHEN `GET /api/recurrentes`
- THEN responde 200 con el listado (sin acciones de modificación en el payload)

---

### Requirement: POST /api/recurrentes

El endpoint MUST crear un nuevo recurrente con `is_active = true`. El body MUST incluir `monto` (number > 0), `tipo` ('gasto'|'ingreso'), `moneda` ('ARS'|'USD'), `frecuencia` ('diario'|'semanal'|'quincenal'|'mensual'|'anual'). Campos opcionales: `categoria`, `empresa_nombre` (default 'Personal'), `descripcion`. Un viewer MUST recibir 403. Frecuencia fuera de whitelist MUST recibir 400.

#### Scenario: Creación exitosa

- GIVEN editor logueado, body válido con frecuencia='quincenal'
- WHEN `POST /api/recurrentes`
- THEN responde 201 con el objeto creado, `is_active=true`, `deleted_at=null`

#### Scenario: Viewer bloqueado

- GIVEN viewer logueado
- WHEN `POST /api/recurrentes` con body válido
- THEN responde 403

#### Scenario: Frecuencia inválida

- GIVEN editor logueado, body con `frecuencia='trimestral'`
- WHEN `POST /api/recurrentes`
- THEN responde 400

---

### Requirement: PATCH /api/recurrentes/:id

El endpoint MUST permitir editar `monto`, `tipo`, `moneda`, `frecuencia`, `categoria`, `empresa_nombre`, `descripcion`. MUST rechazar edición de recurrentes con `deleted_at NOT NULL` con 404. MUST rechazar viewers con 403. MUST rechazar frecuencia fuera de whitelist con 400. MUST validar ownership/scope.

#### Scenario: Edición exitosa

- GIVEN owner, recurrente activo propio
- WHEN `PATCH /api/recurrentes/:id` con `{ "monto": 9000 }`
- THEN responde 200 con `monto = 9000`, resto sin cambios

#### Scenario: No se puede editar borrado

- GIVEN recurrente con `deleted_at NOT NULL`
- WHEN `PATCH /api/recurrentes/:id`
- THEN responde 404

---

### Requirement: PATCH /api/recurrentes/:id/toggle

El endpoint MUST invertir `is_active`. MUST NOT modificar `last_processed`. MUST rechazar viewers (403) y recurrentes borrados (404).

#### Scenario: Pausar activo

- GIVEN recurrente con `is_active=true`, `last_processed=2026-05-01`
- WHEN `PATCH /api/recurrentes/:id/toggle`
- THEN responde 200 con `is_active=false` y `last_processed=2026-05-01` (sin cambio)

#### Scenario: Reactivar pausado

- GIVEN recurrente con `is_active=false`
- WHEN `PATCH /api/recurrentes/:id/toggle`
- THEN responde 200 con `is_active=true`

---

### Requirement: DELETE /api/recurrentes/:id

El endpoint MUST hacer soft delete (set `deleted_at = now()`). MUST rechazar viewers (403) y registros ya borrados (404). MUST validar scope.

#### Scenario: Soft delete exitoso

- GIVEN editor, recurrente activo
- WHEN `DELETE /api/recurrentes/:id`
- THEN responde 200, el recurrente desaparece de `GET /api/recurrentes` por defecto

#### Scenario: Doble delete

- GIVEN recurrente con `deleted_at NOT NULL`
- WHEN `DELETE /api/recurrentes/:id`
- THEN responde 404

---

### Requirement: Cron extendido con quincenal y anual

El cron MUST procesar un recurrente solo si `is_active = true` AND `deleted_at IS NULL`. MUST soportar `frecuencia = 'quincenal'` (umbral 14 días) y `frecuencia = 'anual'` (umbral 365 días). MUST mantener compatibilidad con diario/semanal/mensual. Edge case mensual/anual con día > último del mes destino: MUST usar el último día del mes destino.

#### Scenario: Quincenal no procesado antes de tiempo

- GIVEN recurrente quincenal con `last_processed = hace 10 días`
- WHEN el cron corre
- THEN NO inserta movimiento; `last_processed` sin cambio

#### Scenario: Quincenal procesado en tiempo

- GIVEN recurrente quincenal con `last_processed = hace 14 días`
- WHEN el cron corre
- THEN inserta movimiento y actualiza `last_processed`

#### Scenario: Pausado ignorado por cron

- GIVEN recurrente mensual con `is_active = false`
- WHEN el cron corre
- THEN NO inserta movimiento; `last_processed` sin cambio

#### Scenario: Borrado ignorado por cron

- GIVEN recurrente con `deleted_at NOT NULL`
- WHEN el cron corre
- THEN NO inserta movimiento

#### Scenario: Mensual edge case fin de mes

- GIVEN recurrente mensual con `last_processed = 2026-01-31`
- WHEN el cron corre el 2026-02-28
- THEN `next_run_at` calculado = 2026-02-28; el cron lo procesa ese día

#### Scenario: Mensual creado hoy

- GIVEN recurrente mensual con `last_processed = 2026-05-21`
- WHEN el cron corre el 2026-06-21
- THEN inserta movimiento y actualiza `last_processed`

---

### Requirement: Bot con quincenal y anual

El paso de selección de frecuencia en `/recurrente` MUST ofrecer botones 'quincenal' y 'anual' además de los tres existentes. El resto del flujo MUST permanecer sin cambios. Valores legacy ('diario', 'semanal', 'mensual') MUST seguir funcionando.

#### Scenario: Selección quincenal en bot

- GIVEN usuario Telegram en paso frecuencia del flujo `/recurrente`
- WHEN toca botón "Quincenal"
- THEN el bot registra `frecuencia='quincenal'` y avanza al siguiente paso

#### Scenario: Flujo legacy mensual sin cambios

- GIVEN usuario en flujo `/recurrente`
- WHEN toca botón "Mensual"
- THEN el flujo continúa como antes

---

### Requirement: Tab Recurrentes en dashboard web

El dashboard MUST incluir una tab "Recurrentes" accesible desde la nav. La tab MUST mostrar los recurrentes del scope en cards o tabla con: monto, tipo, frecuencia, empresa, `next_run_label` (con tooltip de fecha absoluta DD/MM/YYYY al hacer hover), badge Activo/Pausado. MUST incluir botón "Nuevo recurrente" que abre modal con form. Cada fila MUST tener acciones Pausar/Activar, Editar, Borrar. Viewers MUST ver el listado pero NOT ver las acciones de modificación. Empty state MUST mostrar "Sin recurrentes. Creá el primero para automatizar cargas."

#### Scenario: Viewer ve listado sin acciones

- GIVEN viewer logueado, dashboard con 2 recurrentes
- WHEN navega a tab Recurrentes
- THEN ve los 2 recurrentes con monto/frecuencia/badge; NO ve botones Pausar/Editar/Borrar ni "Nuevo recurrente"

#### Scenario: Empty state

- GIVEN owner sin recurrentes
- WHEN navega a tab Recurrentes
- THEN ve el texto "Sin recurrentes. Creá el primero para automatizar cargas."

#### Scenario: Tooltip fecha absoluta

- GIVEN recurrente con `next_run_label = "en 30 días"` y `next_run_at = 2026-06-21`
- WHEN usuario hace hover sobre el label
- THEN tooltip muestra "21/06/2026"

#### Scenario: Badge Pausado

- GIVEN recurrente con `is_active = false`
- WHEN se visualiza en la tab
- THEN muestra badge "Pausado" (no "Activo")

#### Scenario: Crear desde modal

- GIVEN editor en tab Recurrentes, modal abierto con form válido
- WHEN confirma creación
- THEN el listado se actualiza con el nuevo recurrente y el modal se cierra
