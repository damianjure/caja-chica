# Tasks: maintenance-mode

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: DB + backend core → PR 2: bot gate → PR 3: frontend |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decision required) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DB migration + backend service + API endpoints + cron + tests | PR 1 | Base: main; ~450 lines; independently deployable |
| 2 | Bot write gate + handler wiring + tests | PR 2 | Base: PR 1 branch; ~150 lines |
| 3 | Frontend banner + AdminPanel section + api.ts client + tests | PR 3 | Base: PR 2 branch; ~350 lines |

---

## Phase 1: Foundation — DB Migration (PR 1 slice A)

- [ ] 1.1 Create `maintenance_mode_phase.sql`: enums `maintenance_kind`, `maintenance_state`; table `maintenance_windows` with all columns per design; partial unique index for single live window; state+starts_at index for cron; RLS policies (read open, write superadmin service-role).
- [ ] 1.2 Verify SQL executes cleanly against local/staging Supabase (no errors, index visible).

## Phase 2: Backend Core — Tests First (PR 1 slice B)

- [ ] 2.1 [RED] Create `tests/maintenance.test.ts`: unit tests for cache hydration, `getMaintenanceState()` return shape, `invalidateCache()`, state-transition logic (grace→active, scheduled→grace at T−5min), concurrent-window rejection (409), 30-min reminder flag.
- [ ] 2.2 [RED] Create `tests/maintenanceMiddleware.test.ts`: 503 on POST/PATCH/DELETE during grace/active; 200 on GET during grace/active; whitelist `/api/maintenance/*` and `/api/health`; `{ code: "MAINTENANCE_ACTIVE" }` body shape.
- [ ] 2.3 [RED] Create `tests/maintenanceNotify.test.ts`: `Promise.allSettled` fan-out; Brevo failure does NOT throw; Telegram failure does NOT throw; both channels called with correct recipient sets.
- [ ] 2.4 [RED] Extend `tests/api.test.ts`: 5 endpoint tests (GET status no-auth 200, POST immediate superadmin 201, POST schedule superadmin 201, POST cancel 200, POST end 200); 403 for member on all mutations; 409 for duplicate active window.

## Phase 3: Backend Core — Implementation (PR 1 slice C)

- [ ] 3.1 Create `src/server/maintenance.ts`: `MaintenanceCache` (30s TTL, explicit invalidate); `getMaintenanceState()` (reads cache or DB); `isWriteBlocked()` predicate; `createImmediateWindow()`, `scheduleWindow()`, `cancelWindow()`, `endWindow()` — each invalidates cache after DB write; `reconcileTransitions(supabase)` cron handler with compare-and-swap UPDATEs.
- [ ] 3.2 Create `src/server/maintenanceMiddleware.ts`: Express middleware — skip GET, skip whitelist paths, call `isWriteBlocked()`, return 503 `{code:"MAINTENANCE_ACTIVE", message}` during grace/active.
- [ ] 3.3 Create `src/server/maintenanceNotify.ts`: `notifyStart()`, `notifyEnd()`, `notify30min()` — each queries active users (email + telegram), fans out via `sendEmail()` + `ctx.api.sendMessage()` with `Promise.allSettled`; errors logged, not thrown.
- [ ] 3.4 Modify `src/server/app.ts`: mount `maintenanceMiddleware` after `requireSession` and before route handlers; add 5 endpoints (`GET /api/maintenance/status` public, `POST /api/maintenance/immediate`, `POST /api/maintenance/schedule`, `POST /api/maintenance/:id/cancel`, `POST /api/maintenance/:id/end`); each mutation calls the corresponding service function + `invalidateCache()`.
- [ ] 3.5 Modify `server.ts`: add `* * * * *` cron that calls `reconcileTransitions(supabase)` (with `unrefInterval` pattern for test safety).
- [ ] 3.6 [GREEN] All Phase 2 tests must pass. Run `node --import tsx --test tests/maintenance.test.ts tests/maintenanceMiddleware.test.ts tests/maintenanceNotify.test.ts tests/api.test.ts`.

## Phase 4: Bot Gate (PR 2)

- [ ] 4.1 [RED] Create `tests/maintenanceGate.test.ts`: `assertBotWritable()` returns false + sends reply during grace/active; returns true during none/scheduled; no DB call when cache is warm.
- [ ] 4.2 [RED] Create `tests/botGateCoverage.test.ts` (or extend existing): grep-based assertion that every write handler file (`movements.ts`, `movements-callbacks.ts`, `recurring.ts`, `entities.ts`) contains an `assertBotWritable` call.
- [ ] 4.3 Create `src/bot/maintenanceGate.ts`: `assertBotWritable(ctx: Context): Promise<boolean>` — calls `isWriteBlocked()`, replies with maintenance message (including notice_text if present), returns false; returns true otherwise.
- [ ] 4.4 Modify `src/bot/commands/movements.ts`: prepend `if (!await assertBotWritable(ctx)) return` at top of each write entry point (text extraction handler, audio handler, movement confirmation callback).
- [ ] 4.5 Modify `src/bot/commands/movements-callbacks.ts`: prepend `assertBotWritable` guard in write callback handlers (confirm-save, edit-field confirms).
- [ ] 4.6 Modify `src/bot/commands/recurring.ts`: prepend `assertBotWritable` guard in recurring create/update handlers.
- [ ] 4.7 Modify `src/bot/commands/entities.ts`: prepend `assertBotWritable` guard in company create/delete handlers.
- [ ] 4.8 [GREEN] Run `node --import tsx --test tests/maintenanceGate.test.ts tests/botGateCoverage.test.ts`. Confirm 0 fail.

## Phase 5: Frontend (PR 3)

- [ ] 5.1 [RED] Create `tests/maintenanceBanner.test.ts` (if needed, or validate via manual smoke): `useMaintenanceStatus` returns `state: "none"` → banner absent; `state: "active"` → banner present with notice_text.
- [ ] 5.2 Create `src/hooks/useMaintenanceStatus.ts`: `useQuery(['maintenanceStatus'], fetchMaintenanceStatus, { staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 1 })`. Returns `{ state, notice_text?, estimated_end_at? }`.
- [ ] 5.3 Modify `src/services/api.ts`: add `fetchMaintenanceStatus()`, `activateImmediateMaintenance(opts)`, `scheduleMaintenance(opts)`, `cancelMaintenance(id)`, `endMaintenance(id)` — typed request/response shapes matching endpoints.
- [ ] 5.4 Create `src/components/dashboard/MaintenanceBanner.tsx`: uses `useMaintenanceStatus`; renders sticky top banner when state is `grace` or `active`; shows notice_text + `estimated_end_at` formatted with `toLocaleString()`; hidden when state is `none` or `ended`.
- [ ] 5.5 Create `src/components/admin/MaintenanceSection.tsx`: shows current state badge; "Mantenimiento inmediato" button (triggers `ConfirmDestructive` with typed-confirm "MANTENIMIENTO" per ADR D7) calls `activateImmediateMaintenance`; "Programar mantenimiento" form (starts_at, optional notice_text, optional estimated_end_at) calls `scheduleMaintenance`; "Finalizar / Cancelar" button when window is live; both create-buttons disabled when window is live with explanatory label; invalidates `['maintenanceStatus']` query on mutation.
- [ ] 5.6 Modify `src/components/AdminPanel.tsx`: import and render `<MaintenanceSection />` inside the superadmin-only panel body.
- [ ] 5.7 Modify `src/App.tsx`: import and render `<MaintenanceBanner />` inside the authenticated layout, above the tab content, gated to authed users only.
- [ ] 5.8 [GREEN] Run full suite `node --import tsx --test tests/**/*.test.ts`. Confirm ≥281 pass, 0 fail, 2 skip.

## Phase 6: Cleanup

- [ ] 6.1 Run `npm run lint` (tsc --noEmit) — fix any type errors introduced by new files.
- [ ] 6.2 Confirm `GET /api/health` returns 200 in all maintenance states (manual smoke or extend api.test.ts).
- [ ] 6.3 Confirm existing non-maintenance GET routes return 200 during grace/active (covered by middleware tests in 2.2).
- [ ] 6.4 Remove any `console.log` debug statements added during development.
