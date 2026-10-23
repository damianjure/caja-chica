# estados-y-errores

Objective: fix the high-priority bugs, silent background errors and design debt found in the flow/states review of Caja Chica.
Branch: `fix/estados-y-errores` · Delivery: one PR per phase (A, B, C), merge to `main` deploys · Runner: `node --import tsx --test` (no DOM/RTL; React logic is extracted to pure helpers).
Approved plan: `~/.claude/plans/dame-el-plan-que-generic-dijkstra.md`.

## Specs

- **S1 (A1)** Resumen "Ingresos/Gastos del mes" show the current calendar month (labelled with the month name), with the delta against the previous calendar month; explicit empty state when the current month has no movements. "Saldo total" stays all-time.
- **S2 (A2)** A login rejected by the auth hook (non-invited email) explains why on the login screen, by reading Supabase's `error`/`error_code`/`error_description` from the redirect URL (query and hash).
- **S3 (A3)** Invitation endpoints report whether the email was sent (`email_sent`); the UI warns when it was not and points to sharing the link.
- **S4 (A4)** AI queue, in the owner's words: "Se lo puede mandar en cola, pero hacer un chequeo más intensivo para que no se pierdan esos mensajes y que salga un mensaje automático de que la IA está caída, se va a guardar tu mensaje. Y cuando vuelva, hacer un resumen de lo que se guardó y avisarlo al usuario mostrando ese resumen." Items are never silently dropped (processed/failed status with result), write permission is re-checked per item, Telegram members' items keep their real author, and web users see the summary.
- **S5 (B1)** Recurrentes cron: per-item failures alert the superadmin and are counted; recurrentes without `chat_id` notify the dashboard owner's Telegram chat ("Aviso al owner por Telegram"); the job does not skip everything when there is no bot.
- **S6 (B2)** Drive section shows loading and a visible error instead of rendering nothing.
- **S7 (B3)** Report export warns on an empty period and on a local download without content; export history is shown in the web ("Mostrarlo en la web").
- **S8 (B4)** Realtime subscription failures show a warning banner and refetch on reconnect.
- **S9 (B5)** Demo seed failure is reported by `/api/me`, alerts the superadmin, and onboarding can continue.
- **S10 (B6)** Daily reminders count only real sends; failures alert the superadmin.
- **S11 (B7)** Image ticket without readable amounts explains why it cannot be saved.
- **S12 (B8)** Review the unverified states (bot empty photo/PDF, 403 edit/delete, 409 delete account, maintenance activation failure, empty states of ask chat, pending links, reminder) and fix only what is broken.
- **S13 (C1)** Owner Telegram link also lives in `telegram_links` (owner, active); existing `usuarios` rows migrated; `usuarios` fallback kept during transition.
- **S14 (C2)** Docs: onboarding branches and who can invite in `CLAUDE.md`; `CHANGELOG.md`; `RUNBOOK.md` for new SQL.
- Out of scope (owner decision "Nada más por ahora"): personal/pyme switcher, WhatsApp, Presupuestos.

## Tasks

| ID | Specs | Route | Status | Commit / evidence |
|---|---|---|---|---|
| T1 | S1 | inline | pending | |
| T2 | S2 | inline | pending | |
| T3 | S3 | inline | pending | |
| T4 | S4 | inline (high risk: persisted format + permissions → own commit + independent verifier) | pending | |
| T5 | S5–S12 | inline | pending | |
| T6 | S13 | inline (high risk: identity + data migration → own commit + independent verifier) | pending | |
| T7 | S14 | inline | pending | |

Route evidence: units share files (`tests/api.test.ts`, `src/server/app.ts`) and land per phase, so no parallel writers.

## Log

- **L1 (2026-10-23, verbatim):** "Dame el plan que vas a utilizar para hacer todos esos cambios."
- **L2 (2026-10-23, owner decisions):** carga sin IA → cola robusta con resumen al usuario (see S4); historial → "Mostrarlo en la web (Recommended)"; recurrentes → "Aviso al owner por Telegram (Recommended)"; alcance → "Nada más por ahora (Recommended)". Plan approved.
- **L3:** Exploration found an extra bug: Telegram items queued by `telegram_links` members store `owner_user_id = null` (`telegramAccess.ts:111`). Added to T4.
- **Next:** T1.
