# Design: invitaciones-unificadas

## Technical Approach

Capa aditiva sobre las tres tablas existentes (`user_invitations`, `dashboard_invitations`, `telegram_invite_tokens`/`telegram_links`). Tres nuevos endpoints en `app.ts`, un cron nuevo en `server.ts`, dos componentes React nuevos (`PersonasPanel`, `WelcomeJoined`), una migración SQL `unified_invitations_phase.sql`. Ningún endpoint existente cambia ni se elimina.

## Architecture Decisions

| Decisión | Elección | Alternativa descartada | Rationale |
|---|---|---|---|
| Lectura unificada | SQL UNION server-side en `GET /api/personas` | Múltiples fetch client-side | Evita N+1, paginación consistente, una sola llamada de red |
| Trigger auth intacto | `user_invitations` permanece tabla canónica para nuevos usuarios | Migrar trigger a nueva tabla | Trigger es DB-level; riesgo alto sin beneficio real en fase 1 |
| Rate limit resend | `createRateLimiter` (Map en memoria, mismo patrón de `tierStrict`) | Nuevo backend de Redis | Single-instance Cloud Run invariant documentado; consistente con `src/server/rateLimit.ts` |
| Telegram pre-auth TTL | 24h (en vez de 30min del flujo normal) | 30min igual que tokens normales | Email puede tardar horas en leer; 30min genera friction innecesaria |
| `is_dashboard_joiner` | Derivado en `GET /api/me` de `dashboard_members.invited_by_user_id IS NOT NULL` | Nueva columna en `app_users` | No requiere SQL migration extra; ya disponible en `dashboard_members` |
| WelcomeJoined vs WelcomeWizard | Componente separado `WelcomeJoined` | Condicional en WelcomeWizard | Lógica diverge significativamente (sin demo, pasos distintos); mantener WelcomeWizard sin tocar |
| Orphan bot pre-auth | Bot verifica `app_users` antes de insertar `telegram_links` | Insertar orphan y resolver después | Eliminamos estado inválido en DB; mensaje claro al usuario |
| Bypass `pending_owner_confirm` | Solo cuando `telegram_invite_tokens.pre_authorized = true` | Siempre al venir de dashboard invite | Seguridad: owner sigue controlando en flujo normal; solo opt-in por `telegram_preauth` |

## Data Flow

### GET /api/personas

```
requireSession → resolveDataAccessScope
  │
  ├─ scope.membershipRole === "owner" or superadmin
  │
  ├─ UNION query Supabase:
  │     SELECT id, email, "app" as type, role, status, created_at,
  │            accepted_at, expires_at, last_reminder_at, null as telegram_link_status
  │     FROM user_invitations WHERE invited_by = caller
  │   UNION ALL
  │     SELECT id, email, "dashboard" as type, role, status, created_at,
  │            accepted_at, expires_at, last_reminder_at, tl.status as telegram_link_status
  │     FROM dashboard_invitations di
  │     LEFT JOIN telegram_links tl ON tl.app_user_id = di.accepted_user_id
  │                                  AND tl.dashboard_id = di.dashboard_id
  │                                  AND tl.status = 'active'
  │     WHERE di.dashboard_id = scope.dashboardId
  │
  ├─ Derivar status por registro:
  │     if accepted_at IS NOT NULL → "active"
  │     else if expires_at IS NOT NULL AND expires_at < now → "expired"
  │     else if status = "revoked" → "revoked"
  │     else → "pending"
  │
  ├─ last_action_at = MAX(accepted_at, last_reminder_at, created_at)
  │
  └─ res.json(PersonaRecord[])
```

### POST /api/personas/:id/resend

```
requireSession → requireOwnerOrAdmin
  │
  ├─ lookup por id en user_invitations → tipo "app"
  │   OR en dashboard_invitations del scope → tipo "dashboard"
  │
  ├─ Validar: status = "pending" AND (expires_at IS NULL OR expires_at > now)
  │
  ├─ Si expires_at vencido → regenerar invite_token + actualizar expires_at
  │
  ├─ rate limit: Map<userId, {count, resetAt}> — 5 req/min por user
  │
  ├─ UPDATE last_reminder_at = NOW()
  │
  ├─ tipo "app" → sendAppInvitationEmail()
  │   tipo "dashboard" → sendDashboardInvitationEmail()
  │
  └─ res.json({ ok: true, sent_at: ISO })
```

### PATCH /api/personas/:id/role

```
requireSession → requireOwnerOrAdmin
  │
  ├─ lookup tipo + tabla
  ├─ Matriz de transiciones:
  │     app invite pending: actualiza user_invitations.role
  │     app invite accepted: 403 (app_users.role — fuera de scope)
  │     dashboard invite pending: actualiza dashboard_invitations.role
  │     dashboard invite accepted: actualiza dashboard_members.role + reset permissions a {}
  │
  └─ res.json({ ok: true })
```

### Telegram pre-auth en POST /api/dashboard/invitations

```
POST body: { email, role, telegram_preauth?: boolean }
  │
  ├─ (flujo normal existente)
  │
  └─ if telegram_preauth === true:
       │
       ├─ buscar app_users por email → si existe, usar user_id como target
       │   si no existe, target_user_id = null (se actualizará en syncPendingDashboard)
       │
       ├─ INSERT telegram_invite_tokens {
       │     token, dashboard_id, target_user_id (nullable),
       │     created_by_user_id, expires_at = now + 24h,
       │     status = "pending", pre_authorized = true
       │   }
       │
       ├─ UPDATE dashboard_invitations SET
       │     telegram_preauth = true,
       │     telegram_invite_token_id = <token_id>
       │
       └─ embed deep link en email:
            t.me/<BOT_USERNAME>?start=<token>
            → sendDashboardInvitationEmail(..., telegramDeepLink)
```

### Bot handler pre-auth (server.ts handleTelegramInviteToken)

```
Token recibido por /start
  │
  ├─ lookup token → telegram_invite_tokens
  ├─ si pre_authorized = true:
  │     ├─ verificar que app_users existe para target_user_id
  │     │   si NO existe → responder "Primero completá el login en la app, luego volvé aquí"
  │     │   (no insertar telegram_links)
  │     │
  │     └─ pivot guard (mismo que flujo normal)
  │         INSERT telegram_links { status = "active" }  ← sin pending_owner_confirm
  │         mark token = claimed
  │
  └─ si NOT pre_authorized → flujo normal (pending_owner_confirm + owner confirma)
```

### WelcomeJoined trigger

```
GET /api/me → incluye is_dashboard_joiner: boolean
  │
  ├─ derivado: dashboard_members row con invited_by_user_id IS NOT NULL
  │            AND onboarding_state IN ('pending', 'seeded')
  │
  └─ DashboardApp.tsx:
       if is_dashboard_joiner → <WelcomeJoined />
       else if onboarding_state in (pending, seeded) → <WelcomeWizard />

ensureOnboardingSeed (requireSession):
  if is_dashboard_joiner → skip seedDemoData, set onboarding_state = 'completed'
```

### Cron reminder diario

```
server.ts cron.schedule('0 10 * * *', async () => {
  │
  ├─ query user_invitations:
  │     status = 'pending'
  │     AND created_at < now() - INTERVAL '3 days'
  │     AND expires_at > now() (o IS NULL)
  │     AND (last_reminder_at IS NULL OR last_reminder_at < now() - INTERVAL '1 day')
  │
  ├─ for...of (try/catch por row):
  │     sendAppInvitationEmail(email, inviteUrl)
  │     UPDATE last_reminder_at = NOW()
  │
  ├─ query dashboard_invitations (misma lógica)
  │     for...of: sendDashboardInvitationEmail + UPDATE last_reminder_at
  │
  └─ log count enviados
})
```

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `unified_invitations_phase.sql` | Crear | Migración: `last_reminder_at` en ambas tablas, `telegram_preauth + telegram_invite_token_id` en `dashboard_invitations`, `pre_authorized` en `telegram_invite_tokens`. Índices para UNION queries. |
| `src/server/app.ts` | Modificar | Agregar `GET /api/personas`, `POST /api/personas/:id/resend`, `PATCH /api/personas/:id/role`. Modificar `POST /api/dashboard/invitations` (telegram_preauth). Modificar `GET /api/me` (is_dashboard_joiner). Modificar `ensureOnboardingSeed` (joiner bypass). |
| `src/server/validation.ts` | Modificar | Agregar `parseDashboardInvitationRequest` tipo extendido con `telegram_preauth?: boolean`. |
| `src/server/email.ts` | Modificar | `sendDashboardInvitationEmail` acepta `telegramDeepLink?: string` opcional, lo incluye en HTML si presente. |
| `src/services/api.ts` | Modificar | Agregar types `PersonaRecord`, `PersonaStatus`, `PersonaScope`. Métodos `listPersonas()`, `resendInvitation(id)`, `updatePersonaRole(id, role)`. Extender `AppViewer` con `is_dashboard_joiner`. |
| `src/components/PersonasPanel.tsx` | Crear | Tabla unificada con badge status, badge role, last_action, dropdown (Resend, Copy link, Cambiar rol, Revocar). Form: email + role + toggle telegram_preauth. Empty states. |
| `src/components/WelcomeJoined.tsx` | Crear | Wizard 2 pasos: bienvenida con inviter+dashboard name, vincular Telegram opcional. Sin demo seed. |
| `src/components/dashboard/tabs/ConfiguracionTab.tsx` | Modificar | Reemplazar form duplicado de invitación y lista de miembros por `<PersonasPanel />`. Remover imports de CollaborationPanel para esa sección. |
| `src/components/CollaborationPanel.tsx` | Modificar | Remover form de invitación y lista de invitations (queda solo sección Vínculos Telegram). |
| `src/DashboardApp.tsx` | Modificar | Leer `is_dashboard_joiner` de `/api/me`. Montar `<WelcomeJoined />` cuando true y onboarding_state pendiente. |
| `server.ts` | Modificar | Agregar cron reminder `0 10 * * *`. Extender `handleTelegramInviteToken` para `pre_authorized` bypass + orphan guard. |
| `tests/personas.test.ts` | Crear | `GET /api/personas` UNION, filtros, paginación. `resend` dispatch por tipo, rate limit, regen token vencido. `role` transitions matrix. ~45 tests. |
| `tests/inviteReminder.test.ts` | Crear | Cron query logic, for-of, try/catch, log output, noop si nada pending. ~15 tests. |
| `tests/telegramPreAuth.test.ts` | Crear | Pre-auth token creation, orphan guard (app_users inexistente), bypass pending_owner_confirm, pivot guard. ~15 tests. |

## Interfaces / Contracts

```typescript
// src/services/api.ts

export type PersonaStatus = "pending" | "active" | "expired" | "revoked";
export type PersonaScope = "app" | "dashboard";

export interface PersonaRecord {
  id: string;
  email: string;
  type: PersonaScope;
  role: string;
  status: PersonaStatus;
  created_at: string;
  last_action_at: string;        // MAX(accepted_at, last_reminder_at, created_at)
  telegram_link_status: "active" | null;
  invite_url: string;
}

// src/server/app.ts (internal)

interface PersonaRow {
  id: string;
  email: string;
  type: "app" | "dashboard";
  role: string;
  raw_status: string;
  created_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  last_reminder_at: string | null;
  telegram_link_status: string | null;
}
```

## SQL Migration: unified_invitations_phase.sql

```sql
-- user_invitations
ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz NULL;

-- dashboard_invitations
ALTER TABLE dashboard_invitations
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS telegram_preauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_invite_token_id uuid
    REFERENCES telegram_invite_tokens(id) ON DELETE SET NULL;

-- telegram_invite_tokens
ALTER TABLE telegram_invite_tokens
  ADD COLUMN IF NOT EXISTS pre_authorized boolean NOT NULL DEFAULT false;

-- Índice para UNION query (filtro por reminder cron)
CREATE INDEX IF NOT EXISTS idx_user_invitations_reminder
  ON user_invitations (status, created_at, last_reminder_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dashboard_invitations_reminder
  ON dashboard_invitations (status, created_at, last_reminder_at)
  WHERE status = 'pending';
```

## Testing Strategy

| Layer | Qué testear | Approach |
|---|---|---|
| Unit | Status derivation logic (`pending/active/expired/revoked`), `last_action_at` computation, rate limiter key isolation | Node test runner, mocks Supabase inline |
| Integration | `GET /api/personas` UNION shape, `resend` dispatch por type, `role` transitions, telegram orphan guard | `tests/personas.test.ts` usando `createApp()` con SupabaseLike mock |
| Integration | Cron query + for-of pattern, try/catch isolation | `tests/inviteReminder.test.ts` |
| Integration | `telegram_preauth` flow: token create, orphan guard, status=active bypass | `tests/telegramPreAuth.test.ts` |

Target: ~75 tests nuevos → total ~231. Strict TDD: red primero.

## Migration / Rollout

1. Aplicar `unified_invitations_phase.sql` en Supabase prod antes de deploy backend
2. Deploy backend Cloud Run (PR1: schema + GET; PR2: resend + role; PR3: telegram + WelcomeJoined)
3. Deploy frontend Firebase Hosting (PR4: PersonasPanel + cron + consolidation)
4. Smoke test manual: invitar dummy, ver en Personas, resend (verificar Brevo log), role-edit, telegram pre-auth desde email

**Chained PRs (4 slices)**:
- PR1: SQL + `GET /api/personas` + types + `tests/personas.test.ts` (UNION read)
- PR2: `resend` + `role` endpoints + tests correspondientes
- PR3: telegram pre-auth en `POST /api/dashboard/invitations` + `WelcomeJoined` + `is_dashboard_joiner` + joiner bypass seed + `tests/telegramPreAuth.test.ts`
- PR4: cron reminder + `PersonasPanel` + consolidación `ConfiguracionTab`/`CollaborationPanel` + `tests/inviteReminder.test.ts`

**Review Workload Forecast**:
- Backend: ~600 líneas
- Frontend: ~400 líneas
- Tests: ~500 líneas
- SQL: ~50 líneas
- Total estimado: ~1550 líneas
- `400-line budget risk: High`
- `Chained PRs recommended: Yes`
- `Decision needed before apply: Yes`

## Open Questions

- [ ] `syncPendingDashboardInvitations` no setea `invited_by_user_id` en `dashboard_members` → el flag `is_dashboard_joiner` puede dar false para cuentas sincronizadas vía heartbeat. Verificar que el path `acceptedNow=true` en `POST /api/dashboard/invitations` sí guarda `invited_by_user_id` (ya lo hace según línea 2174 del código actual). Para el path heartbeat, agregar `invited_by_user_id` en el upsert de `syncPendingDashboardInvitations`.
- [ ] `sendDashboardInvitationEmail` signature actual: `(email, inviteUrl, role, inviterEmail)`. Agregar parámetro opcional `telegramDeepLink?: string` sin romper callers existentes.
