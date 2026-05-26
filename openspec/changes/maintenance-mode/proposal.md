# Proposal: maintenance-mode

## Intent

Give Super Admin (Damián) a controlled way to take Caja Chica into a maintenance window — immediate or scheduled — with proactive multi-channel notice (Telegram + email + in-app banner) and a deterministic write-freeze, so users are never surprised by silent failures and in-progress work has a chance to land.

Success looks like:
- Super Admin can trigger maintenance from the existing admin panel in two clicks (immediate or scheduled) without touching env vars, redeploying, or running SQL.
- All active users get notified through every channel they have (Telegram + email), and every logged-in browser session shows a banner with the estimated end if known.
- Write attempts during maintenance return an explanatory error, not a 500.
- Maintenance can be cancelled at any time and a "service restored" notice goes out through the same channels.

## Problem

Today, the only way to pause writes is to roll a Cloud Run revision or trip env-var flags by hand. There is no:
- centralized state to know "is maintenance active right now".
- way to notify users ahead of time (Telegram and email channels exist but are not wired for ops broadcasts).
- in-app affordance for the user — writes just fail with generic errors.
- distinction between "immediate" and "scheduled" maintenance, or any grace period for in-flight operations.

This is currently solved through Damián manually messaging people, which doesn't scale and is inconsistent. With more active users (post onboarding wizard rollout) and multi-channel surface area (dashboard + bot), the absence of a maintenance primitive is now a real operational gap.

## Proposed Approach

A small server-owned state machine plus thin UI and broadcast wiring. No new infra, no new external integrations.

**1. Single-row maintenance state in Supabase**
- New table `maintenance_windows` with at most one row in state `scheduled` or `active` (enforced by partial unique index). Columns: id, kind (`immediate`|`scheduled`), state (`scheduled`|`grace`|`active`|`ended`|`cancelled`), starts_at, estimated_end_at (nullable), grace_until, notice_text, created_by, timestamps.
- Server is the source of truth — frontend and bot read from `/api/maintenance/status`.

**2. Write-freeze middleware in `app.ts`**
- One Express middleware checks current maintenance state. If `active`, all `POST/PATCH/DELETE /api/*` mutations (except `/api/maintenance/*` for superadmin) return `503` with code `MAINTENANCE_ACTIVE` and the notice text. Reads (`GET`) always pass.
- Bot mutations use the same gate via a shared helper in `src/bot/`.

**3. Grace period semantics**
- On immediate activation: state goes `grace` for 5 minutes (configurable constant), notifications fire, banner shows "vamos a entrar en mantenimiento en X minutos", but writes still allowed. After grace expires, transitions to `active` and writes are blocked.
- On scheduled: at `starts_at`, transitions into `grace` (same 5 min), then `active`. A lightweight cron (every minute) drives transitions; `/api/maintenance/status` also computes the current effective state on read so UI is never stale.

**4. Notification fan-out**
- New module `src/server/maintenanceNotify.ts` reuses existing Brevo (email) and grammY (Telegram) wiring.
- Recipients: active `dashboard_members` + active `app_users` (with email and/or telegram link). Pending/revoked excluded.
- Failures logged, never blocking. Sent best-effort with `Promise.allSettled`.
- Timing:
  - Immediate: one notice at activation (with grace countdown).
  - Scheduled: one notice 30 min before `starts_at` (cron-driven), one at `starts_at`, and one when state ends.

**5. UI surface**
- Extend `AdminPanel.tsx` with a "Mantenimiento" section showing current state and the two action buttons (immediate / schedule). When one window exists, both buttons disabled with an explanation; only "Finalizar" enabled.
- Global banner component mounted in `App.tsx` that polls `/api/maintenance/status` (or via React Query with short staleTime). Visible during `grace` and `active`. Shows notice text and estimated end if present.

**6. Authorization**
- All `/api/maintenance/*` mutation endpoints require `superadmin` role (existing `requireRole` helper). Status endpoint is open to any authenticated user.

**Rationale for this shape**:
- Reuses every existing channel (Brevo, grammY, Supabase, AdminPanel, React Query) — zero new infra.
- The state machine in DB (not just in-memory) survives Cloud Run restarts and scheduled windows that span cold starts.
- Cron-driven transitions + computed-on-read state means we don't depend on a single long-running timer.
- Write-freeze as middleware (not per-route) ensures coverage by default; no risk of forgetting a new endpoint.

## Scope

**In scope**:
- `maintenance_windows` table + SQL patch.
- Endpoints: `GET /api/maintenance/status`, `POST /api/maintenance/immediate`, `POST /api/maintenance/schedule`, `POST /api/maintenance/cancel`, `POST /api/maintenance/end`.
- Write-freeze middleware for HTTP `/api/*` mutations and equivalent guard for bot write commands.
- `src/server/maintenanceNotify.ts` with Telegram + email broadcast helpers, reusing `email.ts` and grammY bot.
- Cron tick (every minute) for state transitions + scheduled pre-notifications.
- `AdminPanel.tsx` Mantenimiento section with state display + 3 actions (immediate, schedule, end/cancel).
- Global banner in dashboard reading from `/api/maintenance/status`.
- Tests: state machine transitions, middleware enforcement, notification fan-out with failure tolerance, RBAC.

**Out of scope** (explicit):
- WhatsApp Business API integration. "WhatsApp" in the request maps to Telegram (existing channel).
- Automatic end of maintenance by elapsed time — end is always manual.
- Queueing multiple scheduled windows — only one active or scheduled at a time.
- History/audit UI of past maintenance windows (rows stay in DB for forensics but no admin view).
- Notifying pending or revoked users.
- Blocking reads during maintenance.
- Allowing `admin` or `member` roles to manage maintenance — banner only.
- Per-dashboard maintenance (this is global, app-wide).

## Risks

1. **Single-instance assumption for cron transitions**: Cloud Run is `max=1` today. If autoscale > 1 ever flips on, the per-minute transition cron could fire twice. Mitigation: use an idempotent SQL update with state guard (`UPDATE ... WHERE state = 'scheduled' AND now() >= starts_at`). To validate during design.

2. **Notification storms on cancel/reschedule**: If Super Admin schedules then cancels then schedules again quickly, users could get a burst of emails/Telegrams. Mitigation: dedupe per `maintenance_windows.id` + transition. To detail in spec.

3. **In-flight long requests during grace transition**: A request started at `grace_until - 1s` could try to commit after `active`. Mitigation: middleware checks state at request entry; long-running writes (e.g., bulk delete) are rare. Open question whether to also gate at commit time — likely overkill.

4. **Brevo / Telegram outages during activation**: Spec says best-effort; we log and continue. Risk is users miss the notice but banner still shows. Acceptable per assumption 9.

5. **Banner polling cost**: If we poll `/api/maintenance/status` aggressively from every tab, that's load. Mitigation: React Query with `staleTime: 60s` + `refetchOnWindowFocus: true`. To confirm in design.

6. **Bot write-freeze coverage**: The bot has many write commands (`/recurrente`, photo flow confirmation, edit/delete callbacks). Each needs the gate. Risk of missing one. Mitigation: centralize through a single helper at the top of every write handler, and add a test that asserts no write callback bypasses it (grep-based or registry-based).

7. **Time zone for scheduled picker**: UI picks local time but server stores UTC. Off-by-one risk if locale handling slips. Mitigation: spec to define explicit conversion and surface the displayed timezone in the UI.

8. **Onboarding seed during maintenance**: `ensureOnboardingSeed` runs in `requireSession`. If a new user logs in during maintenance, do we seed? Probably yes (it's a read-adjacent setup), but should be explicit. Open question for design.
