# Maintenance Mode Specification

## Purpose

Allow Super Admin to freeze application writes — immediately or on a schedule — with a grace period, multi-channel notifications, and an in-app banner. Users always see a clear message rather than silent failures.

## Requirements

### Requirement: Maintenance State Model

The system MUST maintain a single active-or-scheduled maintenance window at any time. State transitions are: `scheduled` → `grace` → `active` → `ended`. An active or scheduled window MAY be cancelled, setting state to `cancelled`. A new window MUST NOT be created while one is in state `scheduled`, `grace`, or `active`.

#### Scenario: Activate immediately while no window exists

- GIVEN no maintenance window is `scheduled`, `grace`, or `active`
- WHEN Super Admin clicks "Mantenimiento inmediato"
- THEN a new window is created with `kind=immediate`, `state=grace`, `grace_until = now + 5 min`
- AND a start notification is dispatched to active users

#### Scenario: Prevent concurrent windows

- GIVEN a window is already `active`
- WHEN Super Admin attempts to activate another window
- THEN the request is rejected with a clear explanation
- AND the "Mantenimiento inmediato" and "Programar mantenimiento" buttons are disabled

#### Scenario: Schedule a future window

- GIVEN no window is `scheduled`, `grace`, or `active`
- WHEN Super Admin submits date, time, optional duration, and optional message
- THEN a window is created with `kind=scheduled`, `state=scheduled`, `starts_at` set to specified UTC time
- AND a 30-min-before reminder is automatically dispatched by cron when `starts_at - 30 min` is reached

---

### Requirement: Grace Period

The system MUST enforce a 5-minute grace period between activation and write-blocking. During grace, new write operations MUST be rejected with a maintenance-specific HTTP error. In-progress operations that started before grace began MAY complete.

#### Scenario: Write rejected during grace

- GIVEN a window is in state `grace`
- WHEN a client sends POST/PATCH/DELETE to any `/api/*` route except `/api/maintenance/*`
- THEN the server responds with HTTP 503 and body `{ code: "MAINTENANCE_ACTIVE", message: "<descriptive text>" }`
- AND no 500 is returned

#### Scenario: Read allowed during grace

- GIVEN a window is in state `grace` or `active`
- WHEN a client sends GET to any `/api/*` route
- THEN the request is processed normally

#### Scenario: Grace transitions to active

- GIVEN a window is in state `grace` and `grace_until` has passed
- WHEN the per-minute cron runs (or the next request computes state)
- THEN the window state becomes `active`
- AND writes remain blocked

---

### Requirement: Public Status Endpoint

The system MUST expose `GET /api/maintenance/status` with no authentication required. The response MUST include current state (`none | scheduled | grace | active`), optional `estimated_end_at`, and optional `notice_text`.

#### Scenario: No active window

- GIVEN no window is `scheduled`, `grace`, or `active`
- WHEN anyone calls `GET /api/maintenance/status`
- THEN response is `{ state: "none" }`

#### Scenario: Active window with notice

- GIVEN a window is `active` with `notice_text` and `estimated_end_at`
- WHEN anyone calls `GET /api/maintenance/status`
- THEN response includes `state: "active"`, `notice_text`, and `estimated_end_at`

---

### Requirement: Global In-App Banner

The frontend MUST display a banner to ALL logged-in users when maintenance state is `grace` or `active`. The banner MUST show the notice text and estimated end time (if set). The banner MUST disappear within 60 seconds of maintenance ending.

#### Scenario: Banner appears on active maintenance

- GIVEN a maintenance window becomes `active`
- WHEN a logged-in user views the dashboard (within the next 60 s polling cycle)
- THEN a banner is visible at the top of the page with notice text and estimated end time

#### Scenario: Banner disappears after maintenance ends

- GIVEN a maintenance window was `active` and Super Admin clicks "Finalizar mantenimiento"
- WHEN the next 60 s poll fires (or on window focus)
- THEN the banner is no longer displayed

---

### Requirement: Admin Panel Section

The Super Admin panel MUST include a "Mantenimiento" section showing current state and action buttons. When no window is active: show "Mantenimiento inmediato" and "Programar mantenimiento" buttons. When a window is `scheduled`, `grace`, or `active`: show "Finalizar / Cancelar" button and disable the other two with an explanatory label.

#### Scenario: Admin sees current state

- GIVEN Super Admin opens AdminPanel
- WHEN no maintenance window is active
- THEN section shows state `none` and both action buttons enabled

#### Scenario: Admin ends maintenance

- GIVEN a window is `active`
- WHEN Super Admin clicks "Finalizar mantenimiento"
- THEN the window transitions to `ended`
- AND a "service restored" notification is sent to active users
- AND the banner disappears within 60 s

---

### Requirement: Notifications

The system MUST send Telegram + Brevo email notifications to active users at these points: when a scheduled window starts (and at 30 min before), when an immediate window activates (at start), and when maintenance ends. Notification failures MUST be logged and MUST NOT abort the maintenance state transition.

#### Scenario: Notification failure does not block activation

- GIVEN Brevo or Telegram API is unavailable
- WHEN Super Admin activates maintenance
- THEN the window is created and write-freeze proceeds
- AND errors are logged
- AND the API response confirms activation (not an error)

#### Scenario: 30-min-before reminder dispatched

- GIVEN a window is `scheduled` with `starts_at = T`
- WHEN the per-minute cron runs at `T - 30 min`
- THEN a reminder notification is sent to active users

---

### Requirement: Bot Write Gating

The Telegram bot MUST block write operations (recording movements, companies, recurring entries) while maintenance is `grace` or `active`. The gate MUST be applied centrally, not per-handler.

#### Scenario: Bot write rejected during maintenance

- GIVEN a window is `active`
- WHEN a Telegram user sends a message that would create or modify a movement
- THEN the bot replies with a maintenance-mode message
- AND no DB write is attempted

#### Scenario: Bot read commands unaffected

- GIVEN a window is `active`
- WHEN a Telegram user sends `/saldos` or `/buscar`
- THEN the bot replies normally

---

### Requirement: Authorization

Only users with `app_role = superadmin` MUST be able to activate, schedule, cancel, or end maintenance. The status endpoint MUST be public (no auth). All other maintenance mutation endpoints MUST reject non-superadmin callers with HTTP 403.

#### Scenario: Member attempts to activate maintenance

- GIVEN a user with `app_role = member`
- WHEN they call `POST /api/maintenance/immediate`
- THEN the response is HTTP 403

#### Scenario: Status accessible without auth

- GIVEN an unauthenticated request
- WHEN they call `GET /api/maintenance/status`
- THEN the response is HTTP 200 with current state

---

## Invariants

These conditions MUST hold before and after the change is applied:

1. `node --import tsx --test tests/**/*.test.ts` passes (currently 281 pass, 2 skip, 0 fail).
2. `npm run lint` (tsc --noEmit) exits 0.
3. `GET /api/health` continues to return 200 regardless of maintenance state.
4. All existing read endpoints continue to serve responses during maintenance.
5. No existing test for non-maintenance routes breaks due to write-freeze middleware.

## Out of Scope

- WhatsApp Business API notifications
- Automatic maintenance end by timer
- Multiple queued scheduled windows
- History UI for past maintenance windows
- Notifications to pending or revoked users
- Read blocking
- Per-dashboard maintenance (this is app-global)
- Non-superadmin maintenance management
