# Design: maintenance-mode

## Executive Summary

Single-row Supabase `maintenance_windows` table is the source of truth. An Express middleware + a centralized bot gate read state from a thin in-memory cache (hydrated from DB on boot, invalidated on each mutation endpoint and on a per-minute cron tick). A node-cron job drives `grace → active` transitions and 30-min-before reminders. Notifications fan out via existing Brevo + grammY adapters with `Promise.allSettled`. Frontend banner uses React Query polling `GET /api/maintenance/status` every 60s. AdminPanel gets a "Mantenimiento" section. No new external dependencies.

---

## Architectural Approach

- **Pattern**: thin service module (`src/server/maintenance.ts`) + middleware + cron tick. Mirrors existing patterns (`extractionReview`, `inviteReminders`, `drive`).
- **State storage**: Supabase. Single row at a time enforced by partial unique index.
- **Cache**: in-memory mutable object on the Node process, refreshed on (a) boot, (b) every successful maintenance-mutation endpoint, (c) cron tick. Safe under single Cloud Run instance (assumption from sdd-init). On scale-out, drop the cache and read on every request — design keeps that change to one line.
- **Computed-on-read**: `getMaintenanceState()` always reconciles `grace_until` vs `now()` before returning, so missed cron ticks self-heal on the next request.
- **Authorization**: existing `requireRole('superadmin')` middleware. Status endpoint is unauth.

---

## DB Schema

Migration: `maintenance_mode_phase.sql`

```sql
create type maintenance_kind as enum ('immediate', 'scheduled');
create type maintenance_state as enum ('scheduled', 'grace', 'active', 'ended', 'cancelled');

create table maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  kind maintenance_kind not null,
  state maintenance_state not null,
  starts_at timestamptz null,        -- when 'active' begins (post-grace for immediate, scheduled time for scheduled)
  grace_until timestamptz null,      -- end of grace period; null for scheduled until promoted
  estimated_end_at timestamptz null, -- optional
  notice_text text null,
  notification_sent_30min boolean not null default false,
  notification_sent_start boolean not null default false,
  notification_sent_end boolean not null default false,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz null
);

-- At most one window in any "live" state (prevents concurrent windows)
create unique index idx_maintenance_windows_one_live
  on maintenance_windows ((true))
  where state in ('scheduled', 'grace', 'active');

create index idx_maintenance_windows_cron
  on maintenance_windows (state, starts_at)
  where state in ('scheduled', 'grace');

-- RLS: superadmin-only mutations; read open to authenticated (status endpoint uses service role anyway)
alter table maintenance_windows enable row level security;
create policy maintenance_read on maintenance_windows for select using (true);
create policy maintenance_write on maintenance_windows for all
  using (exists (select 1 from app_users where id = auth.uid() and role = 'superadmin'))
  with check (exists (select 1 from app_users where id = auth.uid() and role = 'superadmin'));
```

Backend uses service role, so RLS is defense-in-depth.

---

## State Machine

```
                  (admin: immediate)
   none ─────────────────────────────► grace ──(grace_until <= now)──► active
     │                                                                   │
     │  (admin: schedule, starts_at=T)                                    │
     ├────────────────────► scheduled ──(now >= T)──► grace ──► active    │
     │                          │                                         │
     │                    (admin: cancel)                                 │
     │                          ▼                                         ▼
     └─────────────────────► cancelled                              (admin: end)
                                                                          │
                                                                          ▼
                                                                        ended
```

Transitions:
- `none → scheduled`: `POST /api/maintenance/schedule`
- `none → grace`: `POST /api/maintenance/immediate`
- `scheduled → grace`: cron when `now >= starts_at - 5min`? **No** — for scheduled windows, `starts_at` IS the active-begin moment; grace runs `starts_at - 5min .. starts_at`. Cron promotes `scheduled → grace` at `starts_at - 5min`, then `grace → active` at `starts_at`.
- `grace → active`: cron tick or computed-on-read when `now >= grace_until`.
- `* → cancelled`: while `scheduled` or `grace`, admin clicks Cancel.
- `active → ended`: admin clicks End.

---

## Files

### New
- `maintenance_mode_phase.sql` — migration.
- `src/server/maintenance.ts` — pure service:
  - `getCurrentWindow(supabase)` — fetch live window (state ∈ {scheduled, grace, active}).
  - `getMaintenanceState(supabase)` — returns `{ state, notice_text?, estimated_end_at?, starts_at? }`, reconciles transitions before return.
  - `activateImmediate(supabase, adminId, { notice_text?, estimated_end_at? })`.
  - `scheduleMaintenance(supabase, adminId, { starts_at, notice_text?, estimated_end_at? })`.
  - `cancelMaintenance(supabase, windowId, adminId)`.
  - `endMaintenance(supabase, windowId, adminId)`.
  - `reconcileTransitions(supabase)` — called by cron; promotes `scheduled→grace`, `grace→active`; emits notifications when crossing thresholds; sets `notification_sent_*` flags.
  - Internal: `cache: { window | null, fetchedAt }` with 30s TTL; `invalidateCache()` exported.
- `src/server/maintenanceMiddleware.ts` — Express middleware: if method ∈ {POST, PATCH, PUT, DELETE} and path starts with `/api/` and is NOT `/api/maintenance/*` and NOT `/api/health`, check state; if grace|active → 503 `{ code: "MAINTENANCE_ACTIVE", message }`. Always allows `GET`. Onboarding seed exception: middleware ALSO allows `PATCH /api/me` and `POST /api/me/*` to keep wizard usable mid-maintenance? — **Decision below.**
- `src/server/maintenanceNotify.ts` — fan-out:
  - `notifyMaintenanceStart(window)`, `notifyMaintenance30min(window)`, `notifyMaintenanceEnd(window)`.
  - Active recipients query (see below).
  - `Promise.allSettled` for both Brevo per-user and Telegram per-link. Failures `console.error` only.
- `src/bot/maintenanceGate.ts` — `async function assertBotWritable(ctx): Promise<boolean>`. Called at the top of every write handler. If `state ∈ {grace, active}` → `ctx.reply(maintenanceMessage)` and return `false`. Handlers check return value.
- `src/components/dashboard/MaintenanceBanner.tsx` — top-of-page banner; uses `useQuery(['maintenanceStatus'], fetchStatus, { staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true })`. Renders nothing for `state === 'none'`.
- `src/components/admin/MaintenanceSection.tsx` — AdminPanel subsection: shows state, 3 buttons (immediate / schedule / end-or-cancel), schedule modal with datetime + notice + estimated_end.
- `tests/maintenance.test.ts` — unit tests for `src/server/maintenance.ts` state transitions, cache invalidation.
- `tests/maintenanceMiddleware.test.ts` — middleware path matrix.
- `tests/maintenanceNotify.test.ts` — notification fan-out with mocked Brevo/grammY.
- `tests/botMaintenanceGate.test.ts` — bot gate true/false branches.

### Modified
- `src/server/app.ts` — mount middleware globally before write routes; register 5 endpoints under `/api/maintenance/*`; call `invalidateCache()` after each mutation.
- `server.ts` — cron `* * * * *` (every minute) → `reconcileTransitions(supabase)`; wraps in try/catch.
- `src/bot/commands/movements.ts` + `recurring.ts` + `entities.ts` + `movements-callbacks.ts` — prepend `if (!(await assertBotWritable(ctx))) return;` to every write entry point. Reads (`/saldos`, `/buscar`, `/empresas`, `/categorias`, `/informes`) untouched.
- `src/components/AdminPanel.tsx` — import + render `<MaintenanceSection />`.
- `src/App.tsx` — mount `<MaintenanceBanner />` above main layout, inside `QueryClientProvider`, gated to authenticated users.
- `src/services/api.ts` — add `getMaintenanceStatus()`, `activateMaintenanceImmediate()`, `scheduleMaintenance()`, `cancelMaintenance()`, `endMaintenance()`.

---

## API Endpoints

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/maintenance/status` | none | — | `{ state: 'none'|'scheduled'|'grace'|'active', notice_text?, estimated_end_at?, starts_at? }` |
| POST | `/api/maintenance/immediate` | superadmin | `{ notice_text?, estimated_end_at? }` | `{ window }` or 409 if live exists |
| POST | `/api/maintenance/schedule` | superadmin | `{ starts_at (ISO UTC), notice_text?, estimated_end_at? }` | `{ window }` or 409 |
| POST | `/api/maintenance/:id/cancel` | superadmin | — | `{ ok: true }` (only `scheduled` or `grace`) |
| POST | `/api/maintenance/:id/end` | superadmin | — | `{ ok: true }` (only `active`) |

The middleware whitelists `/api/maintenance/*` and `/api/health`. All other write routes return 503 during `grace|active`.

---

## Active Users Query (notifications)

```ts
// Active app_users: status='active', not soft-deleted
const { data: users } = await supabase
  .from('app_users')
  .select('id, email')
  .eq('status', 'active')
  .is('deleted_at', null);

// Active telegram links (for bot push)
const { data: links } = await supabase
  .from('telegram_links')
  .select('telegram_chat_id, user_id')
  .eq('status', 'active');

// Legacy owner usuarios (Telegram-only legacy users)
const { data: legacy } = await supabase
  .from('usuarios')
  .select('telegram_chat_id, owner_user_id')
  .not('telegram_chat_id', 'is', null);
```

Dedupe by `user_id` across email + Telegram; send email to all active app_users, Telegram to all active `telegram_links` + non-overlapping legacy. Pending invites and revoked links excluded.

---

## Bot Write Gate

`src/bot/maintenanceGate.ts`:

```ts
export async function assertBotWritable(ctx: Context): Promise<boolean> {
  const { state } = await getMaintenanceState(supabaseDeps());
  if (state === 'grace' || state === 'active') {
    await ctx.reply(
      '🛠️ Caja Chica está en mantenimiento.\n' +
      'No se pueden registrar movimientos en este momento.\n' +
      'Te avisamos cuando vuelva el servicio.'
    );
    return false;
  }
  return true;
}
```

Applied at the top of every write entry: `bot.command('agregarempresa', ...)`, photo/audio handlers, `/recurrente`, `/borrar`, edit-last callbacks, extraction confirm callbacks. Grep test ensures every write handler in `src/bot/commands/{movements,movements-callbacks,recurring,entities}.ts` references `assertBotWritable`.

---

## Cron Job (every minute)

In `server.ts`:

```ts
cron.schedule('* * * * *', async () => {
  try {
    await reconcileTransitions(supabaseAdmin);
  } catch (e) {
    console.error('[maintenance-cron]', e);
  }
});
```

`reconcileTransitions`:
1. Load the live window (if any).
2. If `state === 'scheduled'` and `now >= starts_at - 30min` and `!notification_sent_30min` → `notifyMaintenance30min()`, set flag.
3. If `state === 'scheduled'` and `now >= starts_at - 5min` → promote to `grace` (`grace_until = starts_at`).
4. If `state === 'grace'` and `now >= grace_until` → promote to `active`; if `!notification_sent_start` → `notifyMaintenanceStart()`, set flag.
5. Call `invalidateCache()` if anything changed.

Updates use `UPDATE ... WHERE id = $1 AND state = $expected` (compare-and-swap) for idempotency on a hypothetical future multi-instance scenario.

---

## React Query Polling

```ts
// src/hooks/useMaintenanceStatus.ts
export function useMaintenanceStatus() {
  return useQuery({
    queryKey: ['maintenanceStatus'],
    queryFn: () => api.getMaintenanceStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
```

Banner reads this hook. Worst case lag: 60s for banner appear/disappear, which matches spec ("within 60s"). When admin acts, `MaintenanceSection` calls `queryClient.invalidateQueries(['maintenanceStatus'])` for instant local feedback.

---

## Frontend AdminPanel Section

`<MaintenanceSection />` structure:

```
┌─ Mantenimiento ────────────────────────────────────────┐
│ Estado actual: [badge: Sin mantenimiento]              │
│                                                         │
│ [Mantenimiento inmediato]  [Programar mantenimiento]   │
│                                                         │
│ (when scheduled/grace/active:)                          │
│ Ventana: tipo · inicia HH:mm · termina ~HH:mm           │
│ Mensaje: "..."                                          │
│ [Cancelar] o [Finalizar mantenimiento]                  │
└─────────────────────────────────────────────────────────┘
```

Schedule modal: `<input type="datetime-local">` (interpreted as local TZ, converted to UTC ISO before POST), `<input>` for notice, `<input type="datetime-local">` for estimated_end.

Immediate modal: notice + estimated_end inputs; confirms with `ConfirmDestructive` typed-confirm pattern (typed phrase `MANTENIMIENTO`).

---

## Test Strategy

| Layer | File | Coverage |
|---|---|---|
| Unit | `tests/maintenance.test.ts` | state transitions, cache TTL, computed-on-read promotion, concurrent-window rejection |
| Unit | `tests/maintenanceMiddleware.test.ts` | GET passes, POST/PATCH/DELETE 503 when grace/active, `/api/maintenance/*` and `/api/health` bypass, `state=none` lets everything through |
| Unit | `tests/maintenanceNotify.test.ts` | Brevo failure non-blocking, Telegram failure non-blocking, allSettled aggregation, dedupe across channels |
| Unit | `tests/botMaintenanceGate.test.ts` | gate returns false during grace/active and replies; returns true when none/ended/cancelled |
| Unit | `tests/maintenanceCron.test.ts` | scheduled→grace at T-5min, grace→active at grace_until, 30-min reminder fires once |
| Integration | extends `tests/api.test.ts` | full 5 endpoints with superadmin auth, 403 for member, 409 for concurrent |

Per strict TDD: test files written first, fail, then implementation. Test runner: `node --import tsx --test tests/**/*.test.ts`.

---

## Open Questions — Resolved

### 1. Grace period check: at request entry vs DB commit time
**Decision: at request entry (middleware).** The spec says "in-progress operations that started before grace MAY complete" — middleware-at-entry exactly matches: requests that already passed the gate complete naturally; new requests in grace get 503. Wrapping DB commits would require a per-table guard for every write path (HTTP + bot + cron) — fragile and inconsistent with the spec's framing. The risk window is one request lifetime (typically <1s), acceptable.

### 2. Onboarding seed during maintenance
**Decision: allow.** `ensureOnboardingSeed` runs implicitly inside `requireSession` on every authed request — blocking it would break login UX (wizard never renders). The seed touches only the caller's dashboard, is idempotent, and is setup-adjacent (the user can't yet have meaningful "in-flight work" to protect). The middleware whitelist therefore also exempts the seed path:
- The middleware checks the HTTP `method + path`. `ensureOnboardingSeed` runs as a hook, not a separate endpoint, so it is not directly gated by the middleware.
- We DO gate `PATCH /api/me` and `DELETE /api/me/demo-data` normally — those are user-driven, not boot-time. If maintenance is `active` mid-wizard, the user can still browse; finishing the wizard waits until end.
- Effectively: the seed itself is exempt by virtue of running inside `requireSession`; explicit wizard writes are gated as usual.

### 3. Active users query for notifications
**Decision: as specified above.** Source: `app_users.status='active' AND deleted_at IS NULL` for email; `telegram_links.status='active'` + non-overlapping `usuarios.telegram_chat_id IS NOT NULL` (legacy owners) for Telegram. Pending invitations and revoked links excluded by query. Dedupe by `user_id` so a single user with both email and Telegram gets one of each, not duplicates of the same channel.

### 4. Timezone
**Decision: store UTC, display local.** All `timestamptz` columns naturally store UTC. Frontend converts via `new Date(iso).toLocaleString()` for display. Schedule picker uses `<input type="datetime-local">` (local TZ), converted to UTC ISO with `new Date(value).toISOString()` before POST. Bot/email messages render UTC offsets explicitly: `"22:00 ART (01:00 UTC)"`.

### 5. Banner polling: 60s staleTime in React Query
**Confirmed.** `staleTime: 60_000`, `refetchInterval: 60_000`, `refetchOnWindowFocus: true`, `retry: 1`. Aligns with "banner disappears within 60s" requirement. On admin actions, `invalidateQueries` provides instant local feedback without affecting other clients (which still see ≤60s).

---

## ADR-style Decisions

### D1. Single-row enforcement via partial unique index
- **Decision**: `create unique index ... where state in ('scheduled','grace','active')`.
- **Rejected**: app-level check (race condition between two superadmins).
- **Rationale**: DB-level guarantee; matches existing project pattern (`telegram_links` partial unique).

### D2. Computed-on-read + cron, not long-running timers
- **Decision**: every `getMaintenanceState()` reconciles `grace_until` vs `now()`; cron is best-effort.
- **Rejected**: `setTimeout` scheduled at activation. Lost on Cloud Run cold start.
- **Rationale**: stateless, survives restarts, matches Cloud Run lifecycle.

### D3. In-memory cache with 30s TTL + explicit invalidation
- **Decision**: cache `getCurrentWindow` result for 30s; invalidate on every mutation.
- **Rejected**: per-request DB hit (latency on every write) or no cache (unnecessary load).
- **Rationale**: Cloud Run single instance makes this safe. On scale-out, drop the cache — one-line change.

### D4. Middleware-at-entry, not DB-commit gate
- **Decision**: Express middleware checks state before route handler runs.
- **Rejected**: per-table DB constraint or per-route guard. Coverage gaps; spec explicitly allows in-flight to complete.
- **Rationale**: minimal blast radius, one place to audit, matches spec phrasing.

### D5. Centralized bot gate function, called per handler
- **Decision**: `assertBotWritable(ctx)` returns boolean; every write handler calls it first.
- **Rejected**: grammY global middleware. grammY middleware can't easily distinguish read vs write commands without re-implementing routing logic; explicit per-handler call is clearer and grep-auditable.
- **Rationale**: same coverage as global, more inspectable. A test grepping the bot source enforces presence.

### D6. Notifications best-effort with `Promise.allSettled`
- **Decision**: failures logged, never thrown.
- **Rejected**: blocking transition on notification success.
- **Rationale**: spec explicit; matches existing `inviteReminders.ts` pattern.

### D7. Reuse existing `ConfirmDestructive` for immediate maintenance
- **Decision**: immediate-mode trigger uses typed-confirm "MANTENIMIENTO".
- **Rejected**: plain confirm dialog.
- **Rationale**: existing UI primitive, prevents accidental clicks. Aligns with 2026-05-25 Codex fixes.

### D8. Banner inside `QueryClientProvider`, gated to authed
- **Decision**: banner only renders for authed users.
- **Rejected**: render for unauth too. Login screen shouldn't surface internal ops state to anonymous visitors.
- **Rationale**: matches spec ("ALL logged-in users"). Status endpoint stays public for service health probes.

---

## Risks

1. **Multi-instance cron race** (low — Cloud Run max=1 today). Mitigated by compare-and-swap UPDATEs.
2. **Bot gate handler-coverage gaps**. Mitigated by grep-based test (`tests/botMaintenanceGate.test.ts` asserts every bot write file imports `assertBotWritable`).
3. **In-flight requests crossing grace→active**. Acceptable per spec; max exposure ≈ one request lifetime.
4. **Brevo/Telegram outages during transition**. Best-effort by design; banner remains the canonical signal.
5. **Cache staleness on scale-out**. Documented as single-instance invariant; cache removal is a one-line change.
6. **Onboarding wizard mid-maintenance**. Resolved (Q2): seed exempt, explicit wizard writes gated.

---

## Where

- File: `/Users/damian/Dev/Boteado/openspec/changes/maintenance-mode/design.md`
- Engram: `sdd/maintenance-mode/design` (project: balancediario)
