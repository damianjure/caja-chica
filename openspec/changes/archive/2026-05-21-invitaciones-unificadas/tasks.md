# Tasks: invitaciones-unificadas

Strict TDD — red antes de green. Test runner: `node --import tsx --test tests/**/*.test.ts`.

**Review Workload Forecast**
- `Chained PRs recommended: Yes`
- `400-line budget risk: High`
- `Estimated changed lines: ~1550`
- `Decision needed before apply: Yes`

---

## Slice 1 — SQL + GET /api/personas (PR1)

> Dependencias: ninguna. Prerrequisito de todos los demás slices.

### 1.1 Crear SQL migration

- [x] **Crear `unified_invitations_phase.sql`** en `/Users/damian/Dev/Boteado/`
  - Archivos: `unified_invitations_phase.sql`
  - Contenido: `ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS last_reminder_at`; `ALTER TABLE dashboard_invitations ADD COLUMN IF NOT EXISTS last_reminder_at, telegram_preauth, telegram_invite_token_id`; `ALTER TABLE telegram_invite_tokens ADD COLUMN IF NOT EXISTS pre_authorized`; índices parciales en ambas tablas.
  - Verify: archivo existe, SQL parseable sin errores de sintaxis (`psql --single-transaction --dry-run` o revisión manual)

### 1.2 Aplicar migration en Supabase (branch)

- [ ] **Aplicar `unified_invitations_phase.sql` en Supabase prod/branch**
  - Archivos: `unified_invitations_phase.sql`
  - Verify: `SELECT column_name FROM information_schema.columns WHERE table_name IN ('user_invitations','dashboard_invitations','telegram_invite_tokens')` retorna `last_reminder_at`, `telegram_preauth`, `telegram_invite_token_id`, `pre_authorized`

### 1.3 Agregar types en api.ts (frontend)

- [x] **Agregar `PersonaRecord`, `PersonaStatus`, `PersonaScope` a `src/services/api.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/services/api.ts`
  - Verify: TypeScript no reporta errores en los tipos nuevos (`npm run lint`)

### 1.4 Tests en rojo — GET /api/personas

- [x] **Crear `tests/personas.test.ts`** con casos para `GET /api/personas` (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/personas.test.ts`
  - Cubrir: owner ve 3 ítems mixtos ordenados por `last_action_at DESC`; filtro `?status=pending`; invite vencido retorna `status: "expired"`; caller viewer recibe 403; superadmin ve union completa
  - Verify: tests fallan con `404` o error equivalente (endpoint no existe aún)

### 1.5 Implementar GET /api/personas

- [x] **Implementar `GET /api/personas` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: dos queries Supabase (user_invitations + dashboard_invitations con LEFT JOIN telegram_links), merge y sort JS, derivar status (`accepted_at IS NOT NULL → active`, `expires_at < now → expired`, raw_status=revoked → revoked, else pending), calcular `last_action_at = MAX(accepted_at, last_reminder_at, created_at)`, aplicar filtros opcionales, retornar `PersonaRecord[]`
  - Respetar design risk #3: merge JS en app server (no UNION SQL nativo de Supabase)
  - Verify: `npm test` — los tests del paso 1.4 pasan (green)

### 1.6 Agregar `listPersonas()` en api.ts

- [x] **Agregar método `listPersonas(filters?)` en `src/services/api.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/services/api.ts`
  - Verify: método exportado, TypeScript OK

### 1.7 Lint + formato

- [x] **Correr lint y corregir issues del slice**
  - Verify: `npm run lint` sin errores en archivos tocados del slice

---

## Slice 2 — Resend + Role-edit (PR2)

> Depende de: Slice 1 completo (1.5 necesario para lookup de invitaciones por id).

### 2.1 Tests en rojo — resend

- [x] **Agregar tests de `POST /api/personas/:id/resend` en `tests/personas.test.ts`** (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/personas.test.ts`
  - Cubrir: resend exitoso token vigente (200, email enviado); resend token vencido (regenera token, email con nuevo URL); rate limit excedido (429); invite ya aceptado (409); caller no invitador ni admin (403)
  - Verify: tests fallan (endpoint no existe)

### 2.2 Tests en rojo — role-edit

- [x] **Agregar tests de `PATCH /api/personas/:id/role` en `tests/personas.test.ts`** (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/personas.test.ts`
  - Cubrir: owner cambia editor→viewer (200); intento degradar owner (422 con mensaje); invite pending tipo app actualiza user_invitations.role; invite accepted tipo dashboard actualiza dashboard_members.role + reset permissions; caller viewer (403)
  - Verify: tests fallan

### 2.3 Implementar POST /api/personas/:id/resend

- [x] **Implementar `POST /api/personas/:id/resend` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: lookup en user_invitations o dashboard_invitations según scope; validar status pending; verificar caller = invitador o admin; rate limit Map<userId, {count, resetAt}> 3 resend/24h por invitación; si token vencido → regenerar + actualizar expires_at; UPDATE last_reminder_at = NOW(); dispatch email según tipo (sendAppInvitationEmail / sendDashboardInvitationEmail)
  - Verify: `npm test` — tests resend del paso 2.1 pasan (green)

### 2.4 Implementar PATCH /api/personas/:id/role

- [x] **Implementar `PATCH /api/personas/:id/role` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: lookup tipo + tabla; matriz de transiciones (degradar owner → 422, viewer/editor → superadmin → 422, member → superadmin → 422); pending app → user_invitations.role; accepted dashboard → dashboard_members.role + reset permissions = {}
  - Verify: `npm test` — tests role del paso 2.2 pasan (green)

### 2.5 Agregar métodos en api.ts

- [x] **Agregar `resendInvitation(id)` y `updatePersonaRole(id, role)` en `src/services/api.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/services/api.ts`
  - Verify: TypeScript OK, métodos exportados

### 2.6 Lint

- [x] **Lint del slice 2**
  - Verify: `npm run lint` sin errores en archivos tocados

---

## Slice 3 — Telegram pre-auth + WelcomeJoined (PR3)

> Depende de: Slice 1 (migration aplicada para columnas telegram_preauth, pre_authorized).

### 3.1 Tests en rojo — telegram pre-auth

- [x] **Crear `tests/telegramPreAuth.test.ts`** (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/telegramPreAuth.test.ts`
  - Cubrir: POST invite con telegram_preauth=true → crea telegram_invite_token con pre_authorized=true + TTL 24h; POST invite sin telegram_preauth → no crea token; bot handler con pre_authorized=true + app_users existe → telegram_links status=active (bypass pending_owner_confirm); bot handler con pre_authorized=true + app_users NO existe → mensaje error, no inserta; pivot guard activo en pre_authorized path
  - Verify: tests fallan

### 3.2 Modificar POST /api/dashboard/invitations — telegram_preauth

- [x] **Extender `POST /api/dashboard/invitations` en `src/server/app.ts`** con soporte `telegram_preauth`
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: parsear `telegram_preauth` del body; si true → lookup app_users por email (nullable); INSERT telegram_invite_tokens con pre_authorized=true, expires_at=now+24h; UPDATE dashboard_invitations.telegram_preauth=true + telegram_invite_token_id; pasar telegramDeepLink a sendDashboardInvitationEmail

### 3.3 Extender parseDashboardInvitationRequest en validation.ts

- [x] **Agregar `telegram_preauth?: boolean` en `src/server/validation.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/validation.ts`
  - Verify: TypeScript OK

### 3.4 Extender sendDashboardInvitationEmail con telegramDeepLink

- [x] **Agregar parámetro opcional `telegramDeepLink?: string` en `src/server/email.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/email.ts`
  - Lógica: si presente, incluir en HTML del email como botón/CTA destacado
  - Sin romper callers existentes (parámetro opcional al final)
  - Verify: `npm run lint` OK; callers sin cambios siguen compilando

### 3.5 Extender handleTelegramInviteToken en server.ts — pre_authorized bypass

- [x] **Modificar `handleTelegramInviteToken` en `server.ts`** para soporte pre_authorized
  - Archivos: `/Users/damian/Dev/Boteado/server.ts`
  - Lógica: si pre_authorized=true → verificar app_users existe (orphan guard) → si no existe: responder "Primero completá el login en la app, luego volvé aquí"; si existe: pivot guard → INSERT telegram_links con status=active; mark token=claimed
  - Verify: tests telegramPreAuth.test.ts pasan (green)

### 3.6 Tests en rojo — is_dashboard_joiner + ensureOnboardingSeed bypass

- [x] **Agregar tests de is_dashboard_joiner en `tests/personas.test.ts` o nuevo archivo** (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/personas.test.ts`
  - Cubrir: GET /api/me retorna is_dashboard_joiner=true cuando dashboard_members.invited_by_user_id IS NOT NULL; joiner con onboarding_state=pending → ensureOnboardingSeed NO invoca seedDemoData; member sin dashboard → seed corre normalmente
  - Verify: tests fallan

### 3.7 Modificar GET /api/me — is_dashboard_joiner

- [x] **Agregar `is_dashboard_joiner` derivado en `GET /api/me` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: lookup dashboard_members donde user_id = caller AND invited_by_user_id IS NOT NULL → is_dashboard_joiner = true

### 3.8 Extender ensureOnboardingSeed — joiner bypass

- [x] **Modificar `ensureOnboardingSeed` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Lógica: si is_dashboard_joiner → skip seedDemoData; setear onboarding_state='completed' directamente
  - Verify: tests del paso 3.6 pasan (green)

### 3.9 Extender AppViewer type — is_dashboard_joiner

- [x] **Agregar `is_dashboard_joiner: boolean` a `AppViewer` en `src/services/api.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/services/api.ts`
  - Verify: TypeScript OK

### 3.10 Crear WelcomeJoined.tsx

- [x] **Crear `src/components/WelcomeJoined.tsx`**
  - Archivos: `/Users/damian/Dev/Boteado/src/components/WelcomeJoined.tsx`
  - Lógica: wizard 2 pasos — bienvenida con nombre del owner/dashboard; botón "Vincular Telegram" con href al deep link si presente en /api/me; NO invocar demo seed ni purgeDemoData; al cerrar → PATCH /api/me onboarding_state=completed

### 3.11 Integrar WelcomeJoined en DashboardApp.tsx

- [x] **Modificar `src/DashboardApp.tsx`** para montar WelcomeJoined
  - Archivos: `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`
  - Lógica: si is_dashboard_joiner=true Y onboarding_state in (pending, seeded) → `<WelcomeJoined />`; else if onboarding_state in (pending, seeded) → `<WelcomeWizard />` (sin cambios al WelcomeWizard)
  - Verify: `npm run lint` OK

### 3.12 Fix syncPendingDashboardInvitations — invited_by_user_id

- [x] **Agregar `invited_by_user_id` en el upsert de `syncPendingDashboardInvitations` en `src/server/app.ts`**
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Contexto: open question del design — el path heartbeat no seteaba invited_by_user_id, rompiendo is_dashboard_joiner para cuentas sincronizadas vía heartbeat
  - Verify: `npm run lint` OK

### 3.13 Lint

- [x] **Lint del slice 3**
  - Verify: `npm run lint` sin errores

---

## Slice 4 — Cron reminder + PersonasPanel + Consolidación UI (PR4)

> Depende de: Slice 1 (columnas last_reminder_at en DB), Slice 2 (resend implementado).

### 4.1 Tests en rojo — cron reminder

- [x] **Crear `tests/inviteReminder.test.ts`** (red)
  - Archivos: `/Users/damian/Dev/Boteado/tests/inviteReminder.test.ts`
  - Cubrir: invite pending 4 días sin reminder → email enviado + last_reminder_at actualizado; last_reminder_at=hoy → no email; invite > 7 días (expirado natural) → no email; invite < 3 días → no email; for-of try/catch aísla fallo individual; log del count al final; queries usan filtros correctos en ambas tablas
  - Verify: tests fallan (cron no existe aún)

### 4.2 Implementar cron reminder en server.ts

- [x] **Agregar cron `0 10 * * *` en `server.ts`** para reminder de invitaciones
  - Archivos: `/Users/damian/Dev/Boteado/server.ts`
  - Lógica: query user_invitations (status=pending, created_at < now-3d, expires_at > now or null, last_reminder_at IS NULL or < now-1d); for...of con try/catch; sendAppInvitationEmail + UPDATE last_reminder_at; misma lógica para dashboard_invitations con sendDashboardInvitationEmail; log count enviados
  - Verify: `npm test` — tests inviteReminder.test.ts pasan (green)

### 4.3 Agregar invite_url en responses POST invite

- [x] **Modificar `POST /api/dashboard/invitations` y `POST /api/admin/invitations` en `src/server/app.ts`** para incluir `invite_url` en respuesta
  - Archivos: `/Users/damian/Dev/Boteado/src/server/app.ts`
  - Verify: response body contiene `{ id, invite_url, ... }`

### 4.4 Crear PersonasPanel.tsx

- [x] **Crear `src/components/PersonasPanel.tsx`**
  - Archivos: `/Users/damian/Dev/Boteado/src/components/PersonasPanel.tsx`
  - Lógica: tabla unificada con badge status (colores por estado), badge role, columna last_action, dropdown actions (Resend, Copy link, Cambiar rol, Revocar); form de invitación (email + role + toggle telegram_preauth); botón "Copiar link" usa invite_url del response POST; empty states; consume `listPersonas()`, `resendInvitation()`, `updatePersonaRole()` de api.ts

### 4.5 Modificar ConfiguracionTab.tsx — usar PersonasPanel

- [x] **Modificar `src/components/dashboard/tabs/ConfiguracionTab.tsx`**
  - Archivos: `/Users/damian/Dev/Boteado/src/components/dashboard/tabs/ConfiguracionTab.tsx`
  - Lógica: reemplazar form duplicado de invitación y lista de miembros existente por `<PersonasPanel />`; remover imports relacionados con el form anterior
  - Verify: no hay form de invitación duplicado en este componente

### 4.6 Modificar CollaborationPanel.tsx — remover form duplicado

- [x] **Modificar `src/components/CollaborationPanel.tsx`**
  - Archivos: `/Users/damian/Dev/Boteado/src/components/CollaborationPanel.tsx`
  - Lógica: remover form de invitación y lista de invitations; dejar solo sección Vínculos Telegram
  - Verify: CollaborationPanel no contiene form de invitación; sección Vínculos Telegram intacta

### 4.7 Lint final + test suite completa

- [x] **Lint completo y test suite**
  - Verify: `npm run lint` OK; `npm test` → todos los tests pasan (incluyendo ~75 nuevos); total esperado ~231 tests

---

## Slice final — Smoke test + deploy plan

> Ejecutar DESPUÉS de PR4 mergeada.

### F.1 Smoke test manual

- [ ] **Smoke test manual documentado**
  - Pasos: (1) invitar email dummy desde UI → verificar en PersonasPanel; (2) resend → verificar log Brevo; (3) role-edit editor→viewer → verificar badge actualizado; (4) crear invite con telegram_preauth=true → verificar email con deep link; (5) joiner acepta invite → verificar WelcomeJoined se muestra y no demo seed
  - Verify: todos los flujos completan sin errores 500

### F.2 Deploy SQL

- [ ] **Aplicar `unified_invitations_phase.sql` en Supabase prod** (si no aplicado en 1.2)
  - Verify: columnas presentes en information_schema

### F.3 Deploy backend

- [ ] **Deploy backend a Cloud Run** (post PR1+PR2+PR3)
  - Comando: `gcloud builds submit --tag gcr.io/caja-chica-bot/caja-chica --region us-west2 && gcloud run deploy caja-chica ...`
  - Verify: `GET /api/health` responde 200 en Cloud Run URL

### F.4 Deploy frontend

- [ ] **Deploy frontend a Firebase Hosting** (post PR4)
  - Comando: `npm run build && firebase deploy --only hosting`
  - Verify: `https://caja-chica-bot.web.app` carga sin errores JS en consola
