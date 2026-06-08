# CLAUDE.md — Caja Chica (repo: caja-chica)

## REGLA MODO PLAN — SOLO SESIONES MOBILE/WEB

Cuando el usuario indique que está en mobile, o la sesión sea vía web (claude.ai/code):
1. Presentar el plan: qué archivos se tocan, qué se cambia y por qué.
2. Esperar un "ok", "dale", "arrancá" u otra confirmación explícita.
3. Solo entonces ejecutar.

En sesiones desktop/CLI: proceder directamente sin requerir confirmación previa.

---

## Mapa de documentación

- **README.md** — entrada del repo: overview, stack, cómo correr, índice de docs.
- **CLAUDE.md** (este archivo) — estado actual, arquitectura, reglas e invariantes. Atemporal.
- **CHANGELOG.md** — historial cronológico de cambios. NO autocargado, consultar on-demand.
- **RUNBOOK.md** — URLs, deploy, infra, env vars, rotación de secretos. NO autocargado.

> **Mapa de nombres:** producto/proyecto = **Caja Chica** · repo GitHub = `caja-chica` (renombrado desde `balancediario` el 2026-06-03; GitHub redirige las URLs viejas) · carpeta local = `Boteado` (histórico). OJO: `balancediario` también fue un **proyecto GCP** viejo (roto/sin uso) — cuando aparezca en docs de infra refiere a eso, no al repo.
> **Familia de nombres alineada:** repo `caja-chica` · Firebase `caja-chica-bot` · Cloud Run `caja-chica`.
> Las rutas en este archivo son **relativas a la raíz del repo**.
> Datos volátiles (conteo de tests, revisión de Cloud Run, commit HEAD) NO se hardcodean acá — se chequean en vivo.

---

## Resumen ejecutivo real

**Caja Chica** es una app para registrar y consultar movimientos financieros en lenguaje natural para contexto rioplatense.

El producto tiene tres caras:
- dashboard web en React/Vite
- backend HTTP en Express/TypeScript
- bot de Telegram en grammY

Integraciones principales:
- Gemini (`@google/genai`) para extracción desde texto libre
- Supabase para auth, datos y realtime
- Firebase Hosting para frontend productivo
- Cloud Run / Node runtime para backend y bot
- Google Drive API (`googleapis`) para exportación de informes

### Estado real validado (post deploy 2026-05-07)
- login Google por invitación
- bootstrap de superadmin
- member invitado aceptando login
- dashboard por pestañas (móvil: scroll horizontal compacto)
- Fase 1: presupuesto vs real (UI oculta, datos/API intactos), conciliación básica
- CORS productivo corregido
- hook de Supabase corregido, no rompe con RLS
- paneles bot/admin ocultos para `member`
- edición/borrado seguro de movimientos y empresas con auditoría y soft delete
- modelo de dashboard compartido soportado: `owner/editor/viewer`
- **Fase 2 Informes** — ✔ deployado:
  - filtros: día / semana / mes / rango / empresa / tipo / moneda
  - exportación CSV y PDF real (generador propio, sin deps externos)
  - historial persistido en `report_exports`
  - **Google Drive** — integración completa:
    - OAuth2 con `drive.file` scope
    - tokens guardados cifrados en `drive_connections` (AES-256-CBC)
    - `owner` puede conectar/usar Drive; `editor` con permiso `export_drive` también puede exportar
    - `viewer` no puede subir
    - destino `local` o `drive` al exportar
    - historial muestra badge con link directo si destino=drive
- **Bot Telegram Informes** — ✔ deployado:
  - `/informes` y `/exportar` → flujo guiado período/formato/destino
  - soporta: día / semana / mes / año / rango personalizado
  - formatos: CSV y PDF
  - destino: local (envía archivo) o Drive (sube y manda link)
- **Bot /recurrente** — flujo guiado conversacional:
  - monto → tipo → moneda → frecuencia → descripción → insert Supabase
  - soporta diario / semanal / mensual
- `setMyCommands` con retry automático (3 intentos, 2s entre intentos)
- **Dark mode completo** — CSS vars + `!important` override cubre todo
- **Telegram multiusuario (Bloque 2)** — ✔ deployado:
  - flujo editor/viewer: token de invitación → `pending_owner_confirm` → owner confirma
  - tabla `telegram_links` con partial unique index (permite re-vincular post-revoke)
  - tabla `telegram_invite_tokens` TTL 30 min
  - `dashboard_members.permissions` JSONB con 3 toggles: `delete_any`, `export_drive`, `invite_telegram`
  - helper `can(member, action)` en `src/server/permissions.ts`
  - `resolveViaNewLinks()` + fallback a `usuarios` para owners legacy
  - UI: `CollaborationPanel.tsx` con toggles, invitación Telegram, sección de vínculos
- **Bot foto/tickets** — ✔ deployado (2026-05-07):
  - fotos: extracción con Gemini Vision (RECEIPT prompt → HANDWRITTEN fallback si confidence < 0.5)
  - PDFs: descarga → Gemini Files API → extracción → cleanup
  - media groups (álbumes): debounce 1500ms → batch extraction con MULTI_RECEIPT prompt
  - flujo inline keyboard: tarjeta de revisión → editar campo por campo → confirmar → guardar
  - `empresas.cuit` agregado — campo extra para matching futuro
  - sessions en Map con TTL 10 min + sweep cada 5 min
- **Email de invitaciones** — ✔ deployado (Brevo desde 2026-05-20):
  - invitaciones de app y de dashboard disparan email vía Brevo (`POST https://api.brevo.com/v3/smtp/email`)
  - `src/server/email.ts`: `sendAppInvitationEmail()` y `sendDashboardInvitationEmail()`
  - sin SDK extra, `fetch` directo + graceful fallback si `BREVO_API_KEY` ausente
- **Auditoría de seguridad completa 2026-05-04 (judgment-day)** — ver sección "Seguridad"


---

## Reglas prácticas de trabajo

### Regla fuerte
- **Nunca build después de cambios** salvo instrucción explícita que lo justifique.

### Git (flujo simple — solo dev)
- **Commit + push directo a `main`.** No hace falta branch+PR para cambios normales. (main NO está protegida ni hay hook que bloquee el push — verificado 2026-06-03.)
- Usar branch + PR (`gh pr create`) SOLO si el cambio es grande/riesgoso y querés review antes de mergear.
- Conventional commits: `feat(boteado):`, `fix(boteado):`, `chore:`.
- Remote: `git@github.com:damianjure/caja-chica.git` (SSH).

### Deploy automático (CI/CD) — desde 2026-06-08
- **Todo push a `main` dispara el workflow `Deploy` (`.github/workflows/deploy.yml`)** → frontend a Firebase Hosting + backend a Cloud Run. No más deploy manual salvo emergencia (ver RUNBOOK).
- Mergear un PR a `main` también deploya. Para un cambio terminado: push (o merge) y el deploy corre solo.
- Auth via **Workload Identity Federation** (OIDC), no hay keys de larga vida. SA `github-deployer@caja-chica-bot.iam.gserviceaccount.com`. La org policy bloquea crear SA JSON keys, por eso WIF.
- Secrets requeridos en el repo (GitHub → Settings → Secrets → Actions): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`. **Si faltan, el frontend buildea sin Supabase y la app queda en blanco en prod** (`supabase` = null → crash sin error boundary). Detalle completo en RUNBOOK.
- Warnings "Node.js 20 deprecated" en las actions son no-bloqueantes hasta sept-2026.

### Cómo correr tests
```bash
node --import tsx --test tests/**/*.test.ts
# o por archivo:
node --import tsx --test tests/api.test.ts tests/permissions.test.ts
```
Runner: Node.js nativo (`node --import tsx --test`), sin Jest/Vitest. Sweeps usan `unrefInterval` para no colgar el runner.

**E2E (Playwright):** `npm run e2e`. Config en `playwright.config.ts`, specs en `e2e/` (smoke de login). Separado de los tests unit.

---

## Stack técnico real

### Frontend
- React 19
- Vite 6
- TypeScript
- Tailwind CSS v4
- lucide-react
- sonner (toasts)

### Backend
- Express
- TypeScript
- tsx
- grammY
- dotenv
- **googleapis** ← Drive integration

### Datos / Infra
- Supabase
- Firebase Hosting
- Docker
- Cloud Run (`min-instances=0` desde 2026-05-26)
- Cloud Scheduler (4 jobs disparan `/api/crons/*`)
- Secret Manager (backup `CRON_SECRET`)

### IA
- `@google/genai`

### Importante
- **no hay librería externa de PDF** — generador mínimo propio en `src/server/reportExports.ts`
- **no hay librería externa de rate limiting** — Map en memoria
- **no hay librería de cifrado** — AES-256-CBC vía `node:crypto` stdlib

---

## Estructura importante del proyecto

```text
.
├── CLAUDE.md
├── server.ts
├── src/
│   ├── App.tsx
│   ├── DashboardApp.tsx
│   ├── authRedirect.ts
│   ├── index.css                  ← dark mode CSS vars + overrides completos
│   ├── components/
│   │   ├── AdminPanel.tsx
│   │   ├── AppLoadingScreen.tsx
│   │   ├── BotConnectionPanel.tsx
│   │   ├── CollaborationPanel.tsx ← toggles permisos + invitación Telegram + vínculos
│   │   ├── LoginScreen.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── WelcomeWizard.tsx      ← wizard 3 pasos onboarding (bienvenida, tour demo, Telegram opcional)
│   │   └── dashboard/
│   │       ├── Charts.tsx
│   │       ├── LoadingStates.tsx
│   │       ├── primitives.tsx
│   │       └── tabs/
│   │           ├── EmpresasTab.tsx
│   │           ├── GastosTab.tsx
│   │           ├── InformesTab.tsx  ← Drive UI + historial con links
│   │           ├── IngresosTab.tsx
│   │           ├── MovimientosTab.tsx
│   │           └── ResumenTab.tsx
│   ├── dashboard/
│   │   ├── companyAssignment.ts
│   │   └── summary.ts
│   ├── reports/
│   │   └── shared.ts
│   ├── server/
│   │   ├── app.ts                 ← createApp + monta routers (incluye crons)
│   │   ├── cronJobs/              ← lógica pura de crons (sin HTTP)
│   │   │   ├── reminders.ts       ← runDailyReminders({supabase, bot}) → {sent}
│   │   │   └── recurrentes.ts     ← runRecurrentes({supabase, bot}) → {processed}
│   │   ├── routes/
│   │   │   ├── crons.ts           ← createCronsRouter + requireCronSecret middleware
│   │   │   └── ...                ← otros routers (admin, dashboard, drive, empresas, informes, maintenance, me, movimientos, presupuestos, telegram)
│   │   ├── demoSeed.ts            ← ensurePersonalDashboard() + seedDemoData() + purgeDemoData()
│   │   ├── drive.ts               ← Drive OAuth + upload + AES-256-CBC encrypt/decrypt
│   │   ├── email.ts               ← sendAppInvitationEmail() + sendDashboardInvitationEmail() via Brevo
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── extractionReview.ts    ← inline keyboard confirm/edit flow para fotos; TTL 10min
│   │   ├── gemini.ts              ← prompts texto + RECEIPT/HANDWRITTEN/MULTI_RECEIPT para fotos
│   │   ├── inviteReminders.ts     ← processInviteReminders (Cloud Scheduler 10h UTC)
│   │   ├── maintenance.ts         ← reconcileTransitions + cache + hydrate
│   │   ├── maintenanceNotify.ts   ← fan-out Brevo + Telegram
│   │   ├── mediaGroupBuffer.ts    ← debounce genérico para álbumes Telegram (1500ms)
│   │   ├── permissions.ts         ← can(member, action) helper
│   │   ├── reportExports.ts
│   │   ├── telegramAccess.ts      ← resolveViaNewLinks() + fallback legacy
│   │   ├── telegramAudio.ts       ← extracción desde audio/voz
│   │   ├── telegramCompanyResolution.ts ← resolución de empresa por nombre + CUIT
│   │   ├── telegramMedia.ts       ← extractFromPhoto() + extractFromMultiplePhotos() + inferMediaMimeType()
│   │   └── validation.ts          ← PendingExtractionData + isPendingExtractionData + parseReportExportRequest
│   └── services/
│       ├── api.ts
│       └── supabase.ts
├── tests/
│   ├── api.test.ts
│   ├── auth-redirect.test.ts
│   ├── company-assignment.test.ts
│   ├── crons.test.ts              ← endpoints HTTP /api/crons/* (auth + dispatch)
│   ├── cronJobs/
│   │   ├── reminders.test.ts      ← runDailyReminders unit tests (bot null, hour match, errors)
│   │   └── recurrentes.test.ts    ← runRecurrentes unit tests (frecuencias, bot null, idempotencia)
│   ├── dashboardSummary.test.ts
│   ├── env.test.ts
│   ├── mediaGroupBuffer.test.ts   ← 5 tests del debounce buffer
│   ├── permissions.test.ts        ← 11 tests de can()
│   ├── summary.test.ts
│   ├── telegramAccess.test.ts     ← incluye tests multiusuario
│   ├── telegramAudio.test.ts
│   └── telegramMedia.test.ts      ← 14 tests: inferMediaMimeType, parse functions, extractFromPhoto mock
├── db/                                   ← SQL fuera del root (housekeeping 2026-06-05)
│   ├── schema.sql                        ← snapshot completo del schema (antes supabase_schema.sql)
│   └── patches/                          ← patches históricos aplicados a prod a mano
│       └── *.sql                         (ver tabla "Base de datos y SQL" + db/patches/README.md)
├── supabase/migrations/                  ← migraciones gestionadas por el Supabase CLI
├── firebase.json
├── .firebaserc
├── Dockerfile
├── package.json
└── .env.example
```

---


## Arquitectura lógica actual

### 6.1 Separación principal
- `server.ts` → runtime wiring, bot, cron, integración real
- `src/server/app.ts` → app Express testeable
- `src/server/permissions.ts` → `can(member, action)` — permisos granulares editor/viewer
- `src/server/drive.ts` → Drive OAuth helpers + AES-256-CBC encrypt/decrypt
- `src/server/email.ts` → notificaciones de invitación vía Resend
- `src/server/errors.ts` → helper compartido para errores de schema Supabase
- `src/server/extractionReview.ts` → store en memoria + tarjeta revisión + inline keyboard para fotos
- `src/server/gemini.ts` → prompts texto (whitelist intents) + prompts foto (RECEIPT/HANDWRITTEN/MULTI_RECEIPT)
- `src/server/mediaGroupBuffer.ts` → debounce genérico `MediaGroupBuffer<T>` para álbumes Telegram
- `src/server/telegramAccess.ts` → resolución de identidad/permiso Telegram
- `src/server/telegramMedia.ts` → `extractFromPhoto()`, `extractFromMultiplePhotos()`, `inferMediaMimeType()`
- `src/server/validation.ts` → `PendingExtractionData`, `isPendingExtractionData`, `parseReportExportRequest`
- `src/server/reportExports.ts` → generación real CSV/PDF
- `src/reports/shared.ts` → filtros y resolución de períodos compartidos

### 6.2 Flujo principal
1. usuario escribe texto libre o usa dashboard
2. frontend o bot llama backend
3. backend usa Gemini cuando hace falta extraer intención/datos
4. backend valida, persiste y audita
5. dashboard consume API autenticada
6. dashboard escucha realtime y actualiza UI

### 6.3 Modelo de acceso real
El modelo legacy (`owner_user_id`) convive con el nuevo (`dashboard_id`).
**No existe fallback de legacy cuando el usuario ya opera en dashboard compartido** — decisión de seguridad 2026-05-03.

Regla del scope resolver:
- si hay membresía activa en `dashboard_members` → usa `dashboard_id`
- si no → usa `owner_user_id` (usuarios pre-migración)

Roles de dashboard:
- `owner`
- `editor` → permisos granulares via `dashboard_members.permissions` JSONB
- `viewer` → solo lectura

### 6.4 Drive — modelo de acceso
- `canConnectDrive(scope)`: sync — solo `membershipRole === null` (legacy) o `membershipRole === 'owner'`
- `canExportDrive(session, scope)`: async — `canConnectDrive` OR editor con `export_drive: true`
- `resolveDriveOwnerUserId(session, scope)`: editor usa el token del owner (lookup en `dashboard_members`)
- tokens OAuth cifrados con AES-256-CBC usando `TOKEN_ENCRYPTION_KEY` (env)
- `pendingDriveOAuthStates`: Map en memoria con sweep cada 5 min
- callback `/api/drive/callback` no requiere sesión (redirect desde Google)

### 6.5 Telegram — modelo multiusuario (Bloque 2)
- **Owner**: flujo legacy one-shot vía tabla `usuarios` (sin cambios)
- **Editor/Viewer**: flujo doble-factor:
  1. Owner genera token de invitación dirigido (`telegram_invite_tokens`, TTL 30 min)
  2. Usuario abre deep link con token
  3. Bot crea `telegram_links` con status `pending_owner_confirm`
  4. Owner confirma desde dashboard → status `active`
- **Resolución de identidad**: `resolveViaNewLinks()` busca en `telegram_links` primero, fallback a `usuarios` para owners
- **Permisos**: `requireTelegramCan(ctx, action)` reemplaza el antiguo `requireTelegramEditor`
- **Anti-pivot**: pivot guard previene que un Telegram ya vinculado acepte otro invite

---

## Auth, permisos y colaboración

### Auth validada en producción
- `damianjure@gmail.com` entra como `superadmin`
- `damianjuregpt@gmail.com` entra como `member`
- invitación del member marcada como `accepted`
- `app_users` se materializa al loguear

### Restricción visual para members
Los `member` no ven:
- vincular bot de Telegram
- acceso/admin

### Colaboración compartida
- un `member` puede invitar gente a **su mismo dashboard**
- los invitados comparten la misma data
- no crean dashboard propio
- permisos: `viewer` → solo ver / `editor` → ver + cargar datos

### Permisos granulares (editor)
JSONB en `dashboard_members.permissions`:
```json
{ "delete_any": bool, "export_drive": bool, "invite_telegram": bool }
```
Helper: `can(member: MemberContext, action: GranularAction): boolean`
- `delete_any`: editor puede borrar movimientos de otros (default: false, solo borra propios)
- `export_drive`: editor puede exportar a Drive (default: false)
- `invite_telegram`: editor puede generar invites Telegram (default: false)

---

## Dashboard web — estado real

Archivo principal:
- `src/DashboardApp.tsx`

### Tabs actuales reales
- Resumen
- Empresas
- Gastos
- Ingresos
- Informes
- Movimientos

### Cambios UX aplicados
- tab nav **móvil**: scroll horizontal compacto (icon + label, sin descripción)
- tab nav **md+**: grid con descripción
- `Gastos`: filtro por empresa + últimos 5; widget presupuesto oculto (`{false && ...}`)
- `Ingresos`: desglose por fuente + etiquetas + últimos 5
- `Movimientos`: filtro combinado empresa/tipo/moneda
- lo nuevo entra `conciliado` por defecto
- **dark mode completo** — todos los componentes responden a `[data-theme="dark"]`

---

## Informes — estado actual

### Implementado y deployado ✔
- filtros: día / semana / mes / rango / empresa / tipo / moneda
- exportación CSV y PDF real
- historial persistido en `report_exports`
- descarga web desde base64
- **Google Drive**:
  - botón "Conectar Drive" visible solo para `owner`
  - destino `local` o `drive` al exportar (validado server-side)
  - historial muestra badge `Drive` con `ExternalLink` si `destination === "drive"`
  - editor con `export_drive: true` puede exportar a Drive usando token del owner

### SQL aplicado
`drive_oauth_phase.sql` — aplicado en prod 2026-05-07. Crea `drive_connections` + altera `report_exports` con `destination`, `drive_file_id`, `drive_url`.

---

## Backend HTTP — endpoints

Archivo principal: `src/server/app.ts`

### Salud
- `GET /api/health`

### Sesión / cuenta
- `GET /api/me` — retorna `id`, `email`, `role`, `status`, `display_name`, `notification_hour`, `onboarding_state`
- `PATCH /api/me` — actualiza `display_name`, `notification_hour` y/o `onboarding_state` (solo `completed`|`cleaned`)
- `DELETE /api/me/demo-data` — purga registros `is_demo=true` del dashboard del caller; set `onboarding_state=cleaned`
- `GET /api/me/export` — JSON dump (movimientos, empresas, categorías) para GDPR
- `GET /api/me/sessions` — lista sesiones auth activas (via `get_my_sessions` RPC)
- `DELETE /api/me/sessions/:id` — revoca sesión puntual (via `delete_user_session` RPC)
- `DELETE /api/me` — elimina cuenta: borra membresías + `supabase.auth.admin.deleteUser()`

### Extracción IA
- `POST /api/extract` — rate limit 30 req/min por usuario, input max 2000 chars

### Movimientos
- `POST /api/movimientos`
- `GET /api/movimientos?limit=50&before=<ISO_DATE>`
- `DELETE /api/movimientos/:id` — soft delete con auditoría
- `DELETE /api/movimientos/last` — soft delete con auditoría
- `DELETE /api/movimientos/all` *(peligrosa, bloqueada por defecto — ahora scopeada al dashboard del caller)*
- `PATCH /api/movimientos/:id`
- `POST /api/movimientos/:id/conciliar`

### Empresas
- `POST /api/empresas`
- `GET /api/empresas`
- `DELETE /api/empresas/:id` — soft delete
- `PATCH /api/empresas/:id` — retorna 404 si ya está borrada

### Categorías
- `GET /api/categorias`
- `DELETE /api/categorias/:id`

### Presupuestos
- `POST /api/presupuestos`
- `GET /api/presupuestos?period=YYYY-MM`

### Informes
- `POST /api/report-exports`
- `GET /api/report-exports`

### Google Drive
- `GET /api/drive/status`
- `GET /api/drive/auth-url`
- `GET /api/drive/callback` ← no requiere auth (redirect OAuth)
- `DELETE /api/drive/disconnect`

### Bot / vínculo Telegram
- `GET /api/bot/connection`
- `POST /api/bot/connection/link-token`

### Telegram multiusuario (nuevo)
- `GET /api/telegram/links` — lista vínculos del dashboard
- `POST /api/telegram/invite` — genera invite token (owner o editor con `invite_telegram`)
- `POST /api/telegram/links/:id/confirm` — owner confirma vínculo pendiente
- `POST /api/telegram/links/:id/revoke` — revoca vínculo
- `PATCH /api/dashboard/members/:id/permissions` — actualiza permisos granulares de editor

### Admin
- `GET /api/admin/users`
- `GET /api/admin/invitations`
- `POST /api/admin/invitations`
- `POST /api/admin/invitations/:id/revoke`

### Dashboard compartido
- `GET /api/dashboard/members`
- `POST /api/dashboard/invitations`
- `POST /api/dashboard/invitations/:id/revoke`

### Mantenimiento
- `GET /api/maintenance/status` — público (sin auth), polled cada 60s por el frontend. Retorna `{ status, scheduled_at, grace_ends_at, estimated_end_at, message }`
- `POST /api/maintenance/activate` — superadmin only. Inicia período de gracia 5 min. Body: `{ message?, estimatedEnd? }`
- `POST /api/maintenance/schedule` — superadmin only. Body: `{ scheduledAt: ISO, message?, estimatedEnd? }`
- `POST /api/maintenance/end` — superadmin only. Finaliza, envía notificación "servicio restaurado"

### Crons (Cloud Scheduler HTTP triggers)
Auth: header `X-Cron-Secret` con comparación timing-safe (`crypto.timingSafeEqual`). Fail-closed: si `CRON_SECRET` no está seteado, todas las peticiones son rechazadas con 401.

- `POST /api/crons/reminders` — dispara `runDailyReminders`. Retorna `{ ok: true, sent: N }`
- `POST /api/crons/recurrentes` — dispara `runRecurrentes`. Retorna `{ ok: true, processed: N }`
- `POST /api/crons/maintenance` — dispara `reconcileTransitions`. Retorna `{ ok: true }`
- `POST /api/crons/invite-reminders` — dispara `processInviteReminders`. Retorna `{ ok: true, sent: N }`

### Seguridad de la ruta peligrosa
`DELETE /api/movimientos/all` solo se habilita si:
- `ENABLE_DANGEROUS_ROUTES=true`
- header `X-Admin-Token` coincide con `ADMIN_API_TOKEN`
- **siempre scopeada al dashboard/owner del caller — nunca global**

---

## Bot de Telegram — estado real

Runtime: `server.ts`

### Capacidades principales
- `/start` — vinculación con token (owner: one-shot; editor/viewer: doble-factor)
- `/menu`
- `/informes` / `/exportar` → flujo guiado período/formato/destino
- `/empresas` — filtra `deleted_at` correctamente
- `/categorias`
- `/agregarempresa`
- `/borrar`
- `/dashboard`
- `/buscar` — filtra `deleted_at` correctamente
- `/saldos` — filtra `deleted_at` en movimientos y empresas
- `/recurrente` → flujo guiado conversacional
- edición del último ingreso/egreso (scopeada a `dashboard_id`)
- borrado/soft delete de movimiento con confirmación
- borrado/soft delete de empresa con confirmación (filtra `deleted_at`)
- **fotos/tickets**: imagen → Gemini Vision → tarjeta revisión → inline keyboard → guardar
- **selección de ítems de ticket** (Fase 0+1, 2026-06-08): si el ticket tiene ≥2 renglones, el bot muestra una tarjeta con checkboxes (`li:*`) para elegir qué ítems guardar; al confirmar pregunta **Separados** (un movimiento por ítem) o **Sumados** (uno solo con el total). Extracción ítem-level en `extractReceiptWithItems()` (`telegramMedia.ts`) + `RECEIPT_ITEMS_SYSTEM_PROMPT`/`parseReceiptItemsResult` (`gemini.ts`); estado en memoria en `src/server/lineItemsReview.ts` (Map + sweep, single-instance invariant). La metadata del comercio (empresa/fecha) se aplica a todos los ítems. Si hay <2 renglones cae al flujo de revisión de movimiento único. Pendiente Fase 2: misma UI en dashboard web.
- **PDFs**: documento → Gemini Files API → extracción → confirmar → guardar
- **álbumes (media groups)**: múltiples fotos → debounce 1500ms → MULTI_RECEIPT → revisar cada uno
- **audio**: voz → transcripción → extracción texto (implementado en `telegramAudio.ts`)

### Flujo de foto/ticket en bot
- MIME permitidos: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`
- tamaño máximo: 20MB
- retry automático con HANDWRITTEN prompt si confidence < 0.5
- sessions `pendingExtractionByChat` con TTL 10 min + sweep cada 5 min
- campos editables via inline keyboard: monto, empresa, categoría, descripción, tipo, moneda

### Flujo de Informes en bot
- Sessions: `pendingReportSessions` Map con TTL 15 min + sweep cada 5 min
- Destino Drive: solo si `can(member, 'export_drive')` o owner

### Flujo de Recurrente en bot
- Sessions: `pendingRecurrenceSessions` Map con TTL 10 min + sweep cada 5 min

### Modelo del bot
- no opera globalmente — cada chat debe vincularse
- token: expira en 30 min, NULL expiry = tratado como expirado
- `requireTelegramCan(ctx, action)` — reemplazó `requireTelegramEditor`

---

## Cron jobs

Los crons ya NO corren in-process con `node-cron`. Cloud Scheduler dispara los endpoints HTTP `/api/crons/*` en el schedule definido. Los cuerpos lógicos están en `src/server/cronJobs/reminders.ts` y `src/server/cronJobs/recurrentes.ts`.

| Job | Endpoint | Schedule | Auth |
|-----|----------|----------|------|
| Recordatorio diario | `POST /api/crons/reminders` | `* * * * *` (cada minuto, filtra por hora/minuto del usuario) | `X-Cron-Secret` |
| Recurrentes | `POST /api/crons/recurrentes` | `0 8 * * *` (08:00 UTC) | `X-Cron-Secret` |
| Maintenance reconcile | `POST /api/crons/maintenance` | `* * * * *` | `X-Cron-Secret` |
| Invite reminders | `POST /api/crons/invite-reminders` | `0 10 * * *` (10:00 UTC) | `X-Cron-Secret` |

### Rotación de CRON_SECRET
Actualizar `CRON_SECRET` en Cloud Run env vars y en el header del Cloud Scheduler job simultáneamente. No hay mecanismo in-app de rotación.

### Cold start
Cloud Run cold start 2-5s. Cloud Scheduler tiene timeout de 30s — margen seguro. En caso de fallo, Cloud Scheduler reintenta.

---

## Base de datos y SQL

> **Ubicación (housekeeping 2026-06-05):** los patches viven en `db/patches/*.sql` y el snapshot del schema en `db/schema.sql` (antes estaban sueltos en el root). NO están en `supabase/migrations/` a propósito — son históricos aplicados a mano, el CLI no debe re-aplicarlos. Migraciones gestionadas por el CLI: `supabase/migrations/`.

### Patches SQL
| Patch | Estado |
|-------|--------|
| `phase1_supabase_patch.sql` | ✔ prod |
| `fix_auth_hook.sql` | ✔ prod |
| `mutations_audit_soft_delete_phase.sql` | ✔ prod |
| `shared_dashboard_phase.sql` | ✔ prod |
| `shared_dashboard_invitations_phase.sql` | ✔ prod |
| `shared_dashboard_cutover_final.sql` | ✔ prod |
| `report_exports_phase.sql` | ✔ prod |
| `security_definer_hook_patch.sql` | ✔ prod 2026-05-03 |
| `security_hardening_phase.sql` | ✔ prod 2026-05-03 |
| `soft_delete_movimientos_phase.sql` | ✔ prod 2026-05-03 |
| `telegram_multi_user_phase.sql` | ✔ prod 2026-05-04 |
| `drive_oauth_phase.sql` | ✔ prod 2026-05-07 |
| `photo_ticket_phase.sql` | ✔ prod 2026-05-07 |
| `drop_pending_extractions.sql` | ✔ aplicado en prod 2026-05-08 |
| `user_settings_phase.sql` | ✔ prod 2026-05-12 |
| `onboarding_demo_phase.sql` | ✔ prod 2026-05-20 |
| `maintenance_mode_phase.sql` | ✔ prod 2026-05-26 |
| `email_management_phase.sql` | ✔ prod 2026-05-29 |

### `drive_oauth_phase.sql` — qué hizo
- Creó tabla `drive_connections` (`owner_user_id`, `dashboard_id`, `refresh_token_enc`)
- Alteró `report_exports` agregando `destination text check('local','drive')`, `drive_file_id`, `drive_url`

### `photo_ticket_phase.sql` — qué hizo
- Agregó columna `cuit text` a `empresas`
- Creó índice único parcial en `(dashboard_id, cuit)` donde cuit IS NOT NULL y deleted_at IS NULL
- Creó tabla `pending_extractions` (no usada por código actual — extracción es in-memory)

### Cero orphans verificado
`movimientos` y `empresas` — 0 rows con `dashboard_id IS NULL` en producción.

---

## Seguridad — estado post judgment-day 2026-05-04

### Auditorías realizadas
1. **2026-05-03**: auditoría inicial — 7 críticos, 6 altos resueltos
2. **2026-05-04**: judgment-day (3 rondas de juicio paralelo) — 29 issues resueltos

### Fixes judgment-day aplicados (commit 10da726)

| Fix | Ubicación |
|-----|-----------|
| `.eq('deleted_at', null)` → `.is()` en bot (generaba `= NULL`, mostraba borrados) | `server.ts` |
| `/saldos` y `/buscar` filtran `deleted_at` | `server.ts` |
| `confirm_delete_emp_` filtra `deleted_at` | `server.ts` |
| `editar_ultimo_*` update incluye scope `dashboard_id` | `server.ts` |
| Anti-pivot: guard antes de INSERT en `handleTelegramInviteToken` | `server.ts` |
| INSERT invite verifica error de Supabase antes de responder | `server.ts` |
| Token null expiry = tratado como expirado | `server.ts` |
| Cron recurrentes y recordatorios: `forEach(async)` → `for...of` | `server.ts` |
| `DELETE /api/movimientos/all` → soft delete scopeado (antes: global hard delete) | `src/server/app.ts` |
| `DELETE /api/movimientos/all`: error Supabase chequeado, no descartado | `src/server/app.ts` |
| `PATCH /api/empresas/:id`: 404 si empresa ya borrada | `src/server/app.ts` |
| Empresa delete: `console.error` en catch (antes: swallowed silently) | `src/server/app.ts` |
| Backup empresa >500 movimientos: warning log explícito | `src/server/app.ts` |
| Backup empresa: filtra `deleted_at` en movimientos del snapshot | `src/server/app.ts` |
| Editor con `export_drive: true` puede exportar a Drive vía HTTP | `src/server/app.ts` |
| Editor Drive: busca token del owner, no del editor | `src/server/app.ts` |
| N+1 en `listDashboardMembers` → single `.in()` batch | `src/server/app.ts` |
| `syncPendingDashboardInvitations`: deduplicado por user key en process lifetime | `src/server/app.ts` |
| `extractRateLimitMap` + `pendingDriveOAuthStates`: sweep cada 5 min | `src/server/app.ts` |
| `pendingReportSessions` + `pendingRecurrenceSessions`: sweep cada 5 min | `server.ts` |
| `decryptToken`: usa `indexOf(":")` para split, valida longitud ivHex | `src/server/drive.ts` |
| `destination` validado server-side en `parseReportExportRequest` | `src/server/validation.ts` |
| Audit log bulk delete: UUID sentinel + entityType `movimientos_bulk` | `src/server/app.ts` |
| `DASHBOARD_URL` ausente: warning al arrancar si Drive habilitado | `src/server/app.ts` |

### Deuda de seguridad restante (baja prioridad)
- (ninguna pendiente)

---


## Dark mode — arquitectura

- `[data-theme="dark"]` aplicado en `document.documentElement` desde `App.tsx`
- Variables: `--app-canvas`, `--app-surface-1/2/3/4`, `--app-border`, `--app-text-1/2/3/4`
- `@layer utilities` con `!important` mapea clases Tailwind → variables
- Base layer: `input`, `select`, `textarea`, `option` usan variables globalmente

---

## Decisiones de arquitectura importantes

1. invitados de un member comparten el mismo dashboard
2. permisos por dashboard: `viewer` y `editor` con granularidad JSONB
3. Telegram vinculado al usuario real, no al dueño abstracto
4. los datos migran a `dashboard_id` cuando existe contexto compartido
5. las mutaciones importantes quedan auditadas
6. soft delete de empresas Y movimientos — nunca hard delete en rutas normales
7. Drive usa `drive.file` scope (no `drive` completo)
8. solo `owner` puede *conectar* Drive; editor con permiso puede *exportar*
9. tokens OAuth cifrados con AES-256-CBC stdlib, sin deps externos
10. año en informes = rango `YYYY-01-01 / YYYY-12-31` (no type nativo)
11. presupuesto: UI oculta con `{false && ...}`, datos y API intactos
12. **no existe fallback legacy en `getScopeEntityById`** — eliminado 2026-05-03
13. Telegram multiusuario: flujo doble-factor para editor/viewer; owner mantiene flujo legacy
14. Maps en memoria (sessions, OAuth state): sweep periódico cada 5 min con `unrefInterval`. Rate limiting en módulo propio `src/server/rateLimit.ts` con mismo patrón.
15. INSERT Telegram invite sin upsert — partial index de PostgREST es unreliable para onConflict
16. foto → dos prompts en cascada: RECEIPT primero, HANDWRITTEN si confidence < 0.5 — no se pide al usuario que reenvíe
17. álbumes Telegram: debounce 1500ms porque cada foto llega en update separado; un solo call a Gemini para el batch
18. `pending_extractions` tabla borrada — sesiones foto/ticket viven en Map en memoria. **Single-instance invariant**: Cloud Run `max-instances=1` (enforced 2026-05-28, rev `caja-chica-00048-fz7`). Prod usa webhook (no polling), así que con max>1 los updates del mismo chat rutearían a instancias distintas y romperían las Maps (`pendingExtractionByChat`, `pendingReportSessions`, `pendingRecurrenceSessions`, `pendingDriveOAuthStates`). Si alguna vez se necesita escalar, migrar Map → tabla Supabase ANTES de subir max.
19. Tests corren con `node --import tsx --test` — Node.js runner nativo, sin Jest/Vitest
20. **Crons externos via Cloud Scheduler** (2026-05-26) — los 4 jobs corren como HTTP triggers desde Cloud Scheduler, no in-process. Habilita `min-instances=0` (ahorro ~$58/mes). Trade-off: cold start 2-5s en primera request. Auth: `X-Cron-Secret` header con `crypto.timingSafeEqual` y fail-closed.
21. **Idempotencia obligatoria en cron endpoints** — Cloud Scheduler reintenta en 5xx. `runRecurrentes` ya idempotente via `last_processed`; `processInviteReminders` via `last_reminder_at`; `reconcileTransitions` ya idempotente por diseño (transiciones de estado); `runDailyReminders` peor caso = doble mensaje al usuario (aceptable).
22. **Modelo por tarea** (2026-05-28, rev `caja-chica-00049-2p8`) — extracción de **texto** usa `gemini-2.5-flash-lite` ($0.10/$0.40 por 1M, ~3× más barato); **foto/audio** quedan en `gemini-2.5-flash` por calidad de visión/transcripción. Ojo: si la extracción de jerga (lucas/gamba/palo) baja de calidad con lite, revertir el model string en `movements.ts:319` y `routes/movimientos.ts:108` — a volumen bajo el ahorro es centavos.

---


## Archivos clave para abrir primero

- `CLAUDE.md`
- `src/DashboardApp.tsx`
- `src/server/app.ts`
- `src/server/permissions.ts`
- `src/server/telegramAccess.ts`
- `src/server/telegramMedia.ts`
- `src/server/extractionReview.ts`
- `src/server/mediaGroupBuffer.ts`
- `src/server/drive.ts`
- `src/server/gemini.ts`
- `src/server/email.ts`
- `src/server/reportExports.ts`
- `src/server/routes/crons.ts` ← endpoints `/api/crons/*` + auth middleware
- `src/server/cronJobs/reminders.ts`
- `src/server/cronJobs/recurrentes.ts`
- `src/reports/shared.ts`
- `src/services/api.ts`
- `server.ts`
- `tests/api.test.ts`
- `tests/crons.test.ts`

---

