# Archive Report: maintenance-mode

**Change**: maintenance-mode  
**Project**: balancediario  
**Status**: PASS (0 CRITICAL, 1 WARNING — manual steps only)  
**Date**: 2026-05-26  

## Summary

Successfully archived SDD change `maintenance-mode` — 3 stacked PRs implementing a controlled maintenance-mode system for Caja Chica.

**Features delivered**:
- Single-row Supabase `maintenance_windows` table as source of truth
- 5 REST API endpoints (status, activate, schedule, cancel, end) with superadmin authorization
- Write-freeze middleware blocking POST/PATCH/DELETE during grace/active states
- Per-minute cron driving state transitions and scheduled reminders
- Centralized bot write-gate in 5 handlers (movements, movements-callbacks, entities, recurring, extraction)
- Frontend banner (amber for active/grace, blue for scheduled) with React Query polling
- AdminPanel "Mantenimiento" section for superadmin control
- Multi-channel notifications (Brevo + Telegram) with non-blocking fan-out

## Artifacts

### Observation IDs (Engram)
- `#626` — proposal: intent, problem, approach, scope, risks
- `#627` — spec: requirements, scenarios, invariants, out-of-scope
- `#628` — design: architecture, DB schema, files, endpoints, state machine, cron, tests
- `#629` — tasks: workload forecast, 6 phases, task checklist
- `#630` — apply-progress: 3 PR branches, TDD cycle evidence, completed tasks, design deviations
- `#631` — verify-report: verdict PASS, compliance matrix, file existence, issues

### Files Created (12)
**Database**:
- `maintenance_mode_phase.sql` — table, enums, constraints, indexes, RLS

**Backend**:
- `src/server/maintenance.ts` — cache, state machine, transitions
- `src/server/maintenanceNotify.ts` — fan-out Brevo + Telegram
- Modified: `src/server/app.ts` (5 endpoints, middleware)
- Modified: `server.ts` (per-minute cron, boot hydration)

**Bot**:
- `src/bot/maintenance-gate.ts` — assertBotWritable(ctx)
- Modified: `src/bot/commands/movements.ts` (4 write guards)
- Modified: `src/bot/commands/movements-callbacks.ts` (12+ write guards)
- Modified: `src/bot/commands/entities.ts` (6 write guards)
- Modified: `src/bot/commands/recurring.ts` (1 write guard)
- Modified: `src/bot/extraction.ts` (4 write guards)

**Frontend**:
- `src/components/MaintenanceBanner.tsx` — sticky banner
- `src/components/dashboard/tabs/configuracion/MaintenanceSection.tsx` — superadmin controls
- Modified: `src/services/api.ts` (MaintenanceStatus interface + 4 client methods)
- Modified: `src/DashboardApp.tsx` (useQuery + banner render)
- Modified: `src/components/dashboard/tabs/ConfiguracionTab.tsx` (section wiring)

**Tests** (6 files, 38 new tests):
- `tests/maintenance.test.ts` — cache, state transitions, isWriteBlocked()
- `tests/maintenanceMiddleware.test.ts` — 503 on write, 200 on read, whitelists
- `tests/maintenanceNotify.test.ts` — Promise.allSettled, non-blocking failures
- `tests/maintenanceApi.test.ts` — endpoints, auth, 403 for member, 509 during active
- `tests/botMaintenanceGate.test.ts` — assertBotWritable(), true/false by state
- `tests/maintenanceApiClient.test.ts` — client methods

## Test Results

| Metric | Result |
|--------|--------|
| Node test suite | 321 pass / 0 fail / 2 skip (323 total) |
| Maintenance-specific tests | 38 pass / 0 fail |
| TypeScript | Clean (tsc --noEmit exit 0) |
| Test delta | +40 tests from baseline (281 → 321) |

## Spec Compliance

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | State model — table + isWriteBlocked() true for grace+active | ✅ PASS | SQL + maintenance.ts line 104-107 |
| 2 | Grace period — writes blocked; reads allowed | ✅ PASS | maintenanceWriteGuard skips GET, blocks grace+active |
| 3 | Public status endpoint | ✅ PASS | app.ts line 606 — no requireSession |
| 4 | Global banner | ✅ PASS | DashboardApp useQuery + MaintenanceBanner colors |
| 5 | Admin panel section | ✅ PASS | ConfiguracionTab gates on superadmin |
| 6 | Notifications — non-blocking | ✅ PASS | Promise.allSettled fan-out per-user |
| 7 | Bot write gating | ✅ PASS | assertBotWritable in 5 handler files |
| 8 | Authorization | ✅ PASS | superadmin-only mutations; status public |

## Design Deviations Resolved

1. **isWriteBlocked() for grace state**: Spec says "During grace, new write operations MUST be rejected." Task description mistakenly said grace should return false. Kept spec-correct behavior (true for both grace and active). Apply agent fixed the test.

2. **extraction.ts not listed**: Originally not in spec's handler list, but photo/document processing (er:confirm, er:co callbacks) are write operations. Correctly gated with assertBotWritable during apply.

3. **Component paths**: MaintenanceBanner placed at `src/components/` (not `src/components/dashboard/`) and MaintenanceSection at `tabs/configuracion/` (not `src/components/admin/`) — matches project structure where superadmin sections live in ConfiguracionTab.

4. **No standalone hook**: Design mentioned `useMaintenanceStatus.ts` but React Query useQuery was inlined in DashboardApp per design intent; functionally equivalent, no gap.

## Known Issues

### CRITICAL
None.

### WARNING
- **W1**: Tasks 1.2 (verify SQL against staging), 6.2 (GET /api/health smoke), 6.3 (existing GET routes smoke), 6.4 (console.log cleanup) marked incomplete. These are runtime verification steps, not code gaps. All code tasks completed.

### SUGGESTIONS
- **S1**: extraction.ts handlers were unlisted in task but correctly gated during apply — no action needed.
- **S2**: Notification implementation uses per-task .catch() instead of container Promise.allSettled — semantically equivalent, minor style inconsistency.

## Pending Actions

**Manual (not in code)**:
- Apply `maintenance_mode_phase.sql` to prod Supabase (standard for this project; not automated)
- Smoke test `/api/health` returns 200 in all maintenance states
- Smoke test existing GET routes work during grace/active
- Review console.log statements (likely none, but verify)

## PR Chain

All 3 PRs stacked on main via `stacked-to-main` strategy:

1. **PR 1: feat/maintenance-mode-backend** (commit `4d9959a`)
   - DB migration + backend service + API + cron
   - 5 endpoints: status (public), activate/schedule/cancel/end (superadmin)
   - Write-freeze middleware + cache + transitions
   - 312 pass (baseline 281 + 31 tests)

2. **PR 2: feat/maintenance-mode-bot-gate** (commit `0210399`)
   - Bot write-gate in 5 handler files
   - assertBotWritable centralized guard
   - 317 pass (312 + 5 new tests)

3. **PR 3: feat/maintenance-mode-frontend** (commit `6bfaa24`)
   - Banner + AdminPanel section + client methods
   - ConfiguracionTab + DashboardApp wiring
   - 321 pass (317 + 4 new tests)

All PRs independently deployable; backward compatible; no breaking changes.

## Traceability

| Artifact | Topic Key | ID |
|----------|-----------|-----|
| Proposal | sdd/maintenance-mode/proposal | #626 |
| Specification | sdd/maintenance-mode/spec | #627 |
| Design | sdd/maintenance-mode/design | #628 |
| Tasks | sdd/maintenance-mode/tasks | #629 |
| Apply Progress | sdd/maintenance-mode/apply-progress | #630 |
| Verify Report | sdd/maintenance-mode/verify-report | #631 |
| Archive Report | sdd/maintenance-mode/archive-report | #632 |

---

**Archived**: 2026-05-26 04:30 UTC  
**Archive Executor**: haiku  
**Skill**: sdd-archive  
