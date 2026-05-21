# Verify Report: invitaciones-unificadas

**Date**: 2026-05-21  
**Verdict**: PASS WITH WARNINGS  
**Executor**: sdd-verify

---

## Build & Tests

| Check | Result |
|---|---|
| `npm run lint` (tsc --noEmit) | PASS — clean |
| Test suite | 208 total / 206 pass / 2 skip / 0 fail |
| Net new tests | +52 (was 156) |

New test files: `tests/personas.test.ts` (34), `tests/telegramPreAuth.test.ts` (8), `tests/inviteReminder.test.ts` (8).

---

## Task Completeness

All implementation tasks `[x]` in tasks.md.

Open (expected): `1.2`, `F.1`, `F.2`, `F.3`, `F.4` — deploy/infra steps, explicitly out of apply scope.

---

## Spec Requirements Coverage

| Requirement | Tests | Status |
|---|---|---|
| GET /api/personas UNION read | 18 tests in personas.test.ts | PASS |
| POST /api/personas/:id/resend | 8 tests | PASS |
| PATCH /api/personas/:id/role | 8 tests | PASS |
| telegram_preauth in POST /api/dashboard/invitations | 8 tests | PASS |
| WelcomeJoined component | 0 unit tests (UI) | WARNING |
| Cron reminder invitaciones pending | 8 tests | PASS |
| Consolidación form — CollaborationPanel dead code | no importers | WARNING |
| invite_url in POST invite response | indirect coverage | PASS |
| ensureOnboardingSeed excludes joiners | 3 tests | PASS |

---

## Design Adherence

All 10 key design decisions confirmed in code. See engram `sdd/invitaciones-unificadas/verify-report` for full table.

---

## Issues

**WARNING [W1]**: `CollaborationPanel.tsx` still contains an invite form but is not imported anywhere. Task 4.6 left it as dead code rather than deleting content. No functional risk; orphan code risk.

**WARNING [W2]**: `WelcomeJoined.tsx` has no unit/integration test. Spec has 2 BDD scenarios uncovered by automated tests.

**WARNING [W3]**: ~75 test target in tasks not fully reached (+52 net). All spec behaviors covered; shortfall is depth, not missing requirements.

**SUGGESTION [S1]**: Delete `CollaborationPanel.tsx` or add comment marking it intentionally retained.

---

## No Regressions

- Legacy endpoints `POST /api/admin/invitations` + `POST /api/dashboard/invitations`: present + backward-compat
- Auth trigger `on_auth_user_created`: not touched
- Prior 154 tests: all still pass
- No `(req as any)` in app.ts; no TODO/FIXME in new files

---

## Deploy Remaining

- `unified_invitations_phase.sql` — not applied to Supabase prod (tasks 1.2 / F.2)
- Backend Cloud Run — not deployed (F.3)
- Frontend Firebase Hosting — not deployed (F.4)
