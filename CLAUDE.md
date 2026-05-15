# CLAUDE.md

## Fuente de verdad única — 2026-05-12 (post Firebase security headers — HEAD: 5274ae4)

Este es el **único archivo de contexto operativo** del proyecto.

---

## 1. Resumen ejecutivo real

**Boteado** es una app para registrar y consultar movimientos financieros en lenguaje natural para contexto rioplatense.

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

### Estado real validado (post deploy 2026-05-12)
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
- **Email de invitaciones** — ✔ implementado (2026-05-07):
  - invitaciones de app y de dashboard disparan email vía Resend
  - `src/server/email.ts`: `sendAppInvitationEmail()` y `sendDashboardInvitationEmail()`
- **Auditoría de seguridad completa 2026-05-04 (judgment-day)** — ver sección 14

### Estado deploy (2026-05-12)
- Frontend ✔ deployado en `caja-chica-bot.web.app`
- Backend ✔ deployado en Cloud Run
- Tests: 156 total / 154 pass / 2 skip / 0 fail

### Cambios 2026-05-08 (primera ronda — hosting + design)
- **Hosting migration**: `balancediario` (proyecto roto) → `caja-chica-bot`. URLs hardcodeadas actualizadas.
- **Drive permissions split**: `canUseDrive` desaparece. Ahora `canConnectDrive` (sync, solo owners) + `canExportDrive` (async, owners + editors con `export_drive`) + `resolveDriveOwnerUserId` (busca token del owner para editor).
- **Design audit (11 mejoras UX/UI)**:
  - Input siempre visible en todas las tabs (antes solo en Movimientos)
  - Header stats: 4 cards → 2 (menos ruido)
  - Eliminado badge "Realtime Active"
  - Border-radius unificado: `rounded-2xl` cards, `rounded-xl` botones
  - Labels unificados a `text-[11px]`
  - Sign out inline con email del user (header compacto)
  - Sonner toasts en bottom-center (lib `sonner` agregada)
  - Empty state con CTA al composer
  - Dark mode: contraste de borde aumentado
- **Rebrand**: "Boteado" → "Caja Chica" en login, emails, PDFs.
- **`unrefInterval` en sweeps**: previene hang del proceso al terminar tests.

### Cambios 2026-05-08 (segunda ronda — deuda técnica, commit `47fb1b8`)
- **`req.session` tipado**: module augmentation en `src/server/types/express.d.ts` + helper `getSession(req)`. 37 `(req as any).session` eliminados. TypeScript ahora enforcea presencia del middleware.
- **Rate limiting global** (`src/server/rateLimit.ts`): factory `createRateLimiter` con 4 tiers:
  - `tierRead` 300/min por user — todas las rutas GET `/api/*`
  - `tierWrite` 120/min por user — POST/PATCH/DELETE `/api/*`
  - `tierStrict` 30/min por user — `/api/extract` (reemplazó inline)
  - `tierAuth` 20/min por IP — `/api/drive/callback`
  - Headers `X-RateLimit-*` + `Retry-After` en 429
- **Rebrand cleanup**: test fixtures `balancediario` → `cajachica`; eliminado fallback muerto `VITE_SUPABASE_URL` en `server.ts`
- **Firebase `balancediario` borrado**: proyecto GCP eliminado (30 días de gracia para recuperar)
- **`drop_pending_extractions.sql`**: SQL listo — tabla huérfana, **pendiente aplicar en prod Supabase**
- **Tests nuevos** (36 nuevos, total 147):
  - `tests/driveOAuth.test.ts` — 19 tests: encrypt/decrypt, canConnectDrive, canExportDrive, OAuth callback, disconnect
  - `tests/photoFlow.integration.test.ts` — 11 tests: extraction review store, buildReviewCardText, MediaGroupBuffer
  - `tests/rateLimit.test.ts` — 6 tests: allow/block, headers, key isolation, window reset

### Cambios 2026-05-12 (UX/A11y — commits ebeb61f, cdab9c0, 5956220)
- **ModalShell** (`src/components/ui/ModalShell.tsx`): role=dialog, aria-modal, focus trap, Esc-to-close, body scroll-lock, tamaños sm/md/lg/xl
- **ConfirmModal** (`src/components/ui/ConfirmModal.tsx`): reemplaza `window.confirm/prompt`; `requireText` para acciones destructivas; `askReason`; loading state
- **AdminPanel**: botón explícito "Administrar" en cada fila, todas las acciones pasan por ConfirmModal, `role=status/alert` + `aria-live`
- **A11y (Chunk 3)**: `text-neutral-400` → `text-neutral-500` en 11 archivos, aria-labels en icon-only buttons, aria-live en regiones dinámicas

### Cambios 2026-05-12 (ConfiguracionTab reorder + OAuth fix — commit bc4b659)
- **ConfiguracionTab** — orden de secciones ajustado: **1. Preferencias → 2. Miembros → 3. Cuenta**
- **OAuth troubleshooting**: `redirect_uri_mismatch` resuelto. Credenciales OAuth en proyecto GCP `caja-chica-bot` (no `balancediario`). `balancediario` restaurado con `gcloud projects undelete` pero no se usa activamente.
- **Nuevo owner**: primer login entra con todo vacío y en cero — garantizado por el scoping de datos (`dashboard_id` o `owner_user_id` del caller). Sin datos compartidos entre owners distintos.

### Cambios 2026-05-12 (user settings — commit `c65ce13`)
- **`user_settings_phase.sql`** — ✔ aplicado en prod:
  - `app_users.display_name text`
  - `app_users.notification_hour smallint DEFAULT 21 CHECK (0..23)`
  - `get_my_sessions(uuid)` — SECURITY DEFINER, lista sesiones auth del usuario
  - `delete_user_session(uuid, uuid)` — SECURITY DEFINER, revoca sesión puntual
- **`GET /api/me`** — ahora retorna `display_name` y `notification_hour`
- **`PATCH /api/me`** — actualiza `display_name` y/o `notification_hour`
- **`GET /api/me/export`** — JSON dump de movimientos, empresas y categorías (GDPR)
- **`GET /api/me/sessions`** — lista sesiones activas vía `get_my_sessions` RPC
- **`DELETE /api/me/sessions/:id`** — revoca sesión vía `delete_user_session` RPC
- **`DELETE /api/me`** — borra membresías + `supabase.auth.admin.deleteUser()`
- **Cron recordatorio**: `0 21 * * *` → `0 * * * *` (hourly), filtra por `notification_hour` UTC por usuario
- **ConfiguracionTab** — sección **Preferencias**: tema (Claro/Oscuro/Sistema), moneda default (ARS/USD), empresa default, hora del recordatorio (slider)
- **ConfiguracionTab** — sección **Cuenta**: nombre visible (display_name), exportar datos, sesiones activas (lazy-load + revocar), borrar cuenta (confirm con email)
- **Tests**: 9 nuevos (total 154 pass / 2 skip / 0 fail)

### Cambios 2026-05-12 (session self-lockout guard — commit `037035b`)
- **`AppSession.sessionId`** — `requireSession` extrae el claim `session_id` del JWT y lo guarda en la sesión
- **`GET /api/me/sessions`** — ahora retorna `currentSessionId` además de la lista de sesiones
- **`DELETE /api/me/sessions/:id`** — retorna 400 si el `id` es igual al `session_id` del caller (previene auto-bloqueo)
- **UI (ConfiguracionTab)**: badge "Esta sesión" en la fila de la sesión actual; botón "Revocar" deshabilitado para la sesión propia

### Cambios 2026-05-12 (Firebase security headers — commit `5274ae4`)
- **`firebase.json`** — headers de caché y seguridad para hosting:
  - `/assets/**`: `Cache-Control: public, max-age=31536000, immutable` (assets Vite con hash → cache forever)
  - `**`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`

### Pendiente
1. CUIT matching en `resolveTelegramCompany()` — columna `empresas.cuit` existe en DB, lógica no implementada

---

## 2. URLs, proyectos y entornos reales

### Frontend producción
- https://caja-chica-bot.web.app ← migrado 2026-05-08 desde `balancediario` (proyecto roto)

### Backend producción
- https://caja-chica-442790495206.us-west2.run.app

### Firebase project (hosting + backend, unificado)
- `caja-chica-bot`

### Supabase real usado por la app
- proyecto: `dezgusgxotihxkfkxico`

### Google OAuth credentials (Google Sign-In)
- Las credenciales OAuth 2.0 (Client ID / Secret) para Google Sign-In están en el proyecto GCP **`caja-chica-bot`** (no en `balancediario`).
- El Authorized redirect URI configurado en la consola de Google es: `https://dezgusgxotihxkfkxico.supabase.co/auth/v1/callback`

### OJO
NO usar `mlvounduwzfnkldbahnl` para esta app.
NO usar `unidos-para-servir` — es otro proyecto Firebase, no el de Caja Chica.
`balancediario` — proyecto GCP restaurado (undelete 2026-05-12 durante troubleshooting OAuth), pero no se usa para nada activo. Las credenciales OAuth están en `caja-chica-bot`.

---

## 3. Reglas prácticas de trabajo sobre este repo

### Regla fuerte
- **Nunca build después de cambios** salvo instrucción explícita que lo justifique.

### Deploy manual
```bash
# Frontend
npm run build
firebase use caja-chica-bot   # default en .firebaserc
firebase deploy --only hosting

# Backend
gcloud config set project caja-chica-bot
gcloud builds submit --tag gcr.io/caja-chica-bot/caja-chica --region us-west2
gcloud run deploy caja-chica --image gcr.io/caja-chica-bot/caja-chica --region us-west2 --platform managed --quiet
```

### Estado de validación local más reciente
- `npm test` → **154/156 OK** (2 skip intencionales, 0 fail; sweeps con `unrefInterval`, runner no cuelga)
- `npm run lint` → **OK**
- commit HEAD: `5274ae4`

### Cómo correr tests correctamente
```bash
node --import tsx --test tests/**/*.test.ts
# o por archivo:
node --import tsx --test tests/api.test.ts tests/permissions.test.ts tests/telegramAccess.test.ts
```

---

## 4. Stack técnico real

### Frontend
- React 19
- Vite 6
- TypeScript
- Tailwind CSS v4
- motion
- lucide-react
- sonner

### Backend
- Express
- TypeScript
- tsx
- grammY
- node-cron
- dotenv
- **googleapis** ← Drive integration
- **resend** ← emails de invitación

### Datos / Infra
- Supabase
- Firebase Hosting
- Docker
- Cloud Run

### IA
- `@google/genai`

### Importante
- **no hay librería externa de PDF** — generador mínimo propio en `src/server/reportExports.ts`
- **no hay librería externa de rate limiting** — Map en memoria (`src/server/rateLimit.ts`)
- **no hay librería de cifrado** — AES-256-CBC vía `node:crypto` stdlib

---

## 5. Estructura importante del proyecto

```text
.
├── CLAUDE.md
├── server.ts                              ← runtime wiring, bot, cron, integración real
├── src/
│   ├── App.tsx
│   ├── DashboardApp.tsx
│   ├── authRedirect.ts
│   ├── index.css                          ← dark mode CSS vars + overrides completos
│   ├── components/
│   │   ├── AdminPanel.tsx
│   │   ├── AppLoadingScreen.tsx
│   │   ├── BotConnectionPanel.tsx
│   │   ├── CollaborationPanel.tsx         ← toggles permisos + invitación Telegram + vínculos
│   │   ├── LoginScreen.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── dashboard/
│   │   │   ├── Charts.tsx
│   │   │   ├── LoadingStates.tsx
│   │   │   ├── primitives.tsx
│   │   │   └── tabs/
│   │   │       ├── ConfiguracionTab.tsx   ← Preferencias / Miembros / Cuenta
│   │   │       ├── EmpresasTab.tsx
│   │   │       ├── GastosTab.tsx
│   │   │       ├── InformesTab.tsx        ← Drive UI + historial con links
│   │   │       ├── IngresosTab.tsx
│   │   │       ├── MovimientosTab.tsx
│   │   │       └── ResumenTab.tsx
│   │   └── ui/
│   │       ├── ConfirmModal.tsx           ← reemplaza window.confirm; requireText para destructivas
│   │       └── ModalShell.tsx             ← base modal: focus trap, Esc, scroll-lock
│   ├── dashboard/
│   │   ├── companyAssignment.ts
│   │   └── summary.ts
│   ├── reports/
│   │   └── shared.ts
│   ├── server/
│   │   ├── app.ts                         ← app Express testeable
│   │   ├── drive.ts                       ← Drive OAuth + upload + AES-256-CBC encrypt/decrypt
│   │   ├── email.ts                       ← sendAppInvitationEmail() + sendDashboardInvitationEmail() via Resend
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── extractionReview.ts            ← inline keyboard confirm/edit flow para fotos; TTL 10min
│   │   ├── gemini.ts                      ← prompts texto + RECEIPT/HANDWRITTEN/MULTI_RECEIPT para fotos
│   │   ├── mediaGroupBuffer.ts            ← debounce genérico para álbumes Telegram (1500ms)
│   │   ├── permissions.ts                 ← can(member, action) helper
│   │   ├── rateLimit.ts                   ← createRateLimiter factory + 4 tiers
│   │   ├── reportExports.ts
│   │   ├── telegramAccess.ts              ← resolveViaNewLinks() + fallback legacy
│   │   ├── telegramAudio.ts               ← extracción desde audio/voz
│   │   ├── telegramCompanyResolution.ts   ← resolución de empresa por nombre
│   │   ├── telegramMedia.ts               ← extractFromPhoto() + extractFromMultiplePhotos() + inferMediaMimeType()
│   │   ├── types/
│   │   │   └── express.d.ts               ← module augmentation: req.session tipado
│   │   └── validation.ts                  ← PendingExtractionData + isPendingExtractionData + parseReportExportRequest
│   └── services/
│       ├── api.ts
│       └── supabase.ts
├── tests/
│   ├── api.test.ts
│   ├── authRedirect.test.ts
│   ├── company-assignment.test.ts
│   ├── dashboardSummary.test.ts
│   ├── driveOAuth.test.ts
│   ├── env.test.ts
│   ├── mediaGroupBuffer.test.ts           ← 5 tests del debounce buffer
│   ├── permissions.test.ts                ← 11 tests de can()
│   ├── photoFlow.integration.test.ts
│   ├── rateLimit.test.ts
│   ├── superadmin.test.ts
│   ├── telegramAccess.test.ts             ← incluye tests multiusuario
│   ├── telegramAudio.test.ts
│   ├── telegramCompanyResolution.test.ts
│   └── telegramMedia.test.ts              ← 14 tests: inferMediaMimeType, parse functions, extractFromPhoto mock
├── supabase_schema.sql
├── phase1_supabase_patch.sql
├── report_exports_phase.sql               ✔ aplicado en prod
├── fix_auth_hook.sql                      ✔ aplicado en prod
├── shared_dashboard_phase.sql             ✔ aplicado en prod
├── shared_dashboard_invitations_phase.sql ✔ aplicado en prod
├── shared_dashboard_cutover_final.sql     ✔ aplicado en prod
├── mutations_audit_soft_delete_phase.sql  ✔ aplicado en prod
├── security_definer_hook_patch.sql        ✔ aplicado en prod 2026-05-03
├── security_hardening_phase.sql           ✔ aplicado en prod 2026-05-03
├── soft_delete_movimientos_phase.sql      ✔ aplicado en prod 2026-05-03
├── telegram_multi_user_phase.sql          ✔ aplicado en prod 2026-05-04
├── drive_oauth_phase.sql                  ✔ aplicado en prod 2026-05-07
├── photo_ticket_phase.sql                 ✔ aplicado en prod 2026-05-07
├── drop_pending_extractions.sql           ✔ aplicado en prod 2026-05-08
├── user_settings_phase.sql                ✔ aplicado en prod 2026-05-12
├── firebase.json
├── .firebaserc
├── Dockerfile
├── package.json
└── .env.example
```

---

## 6. Arquitectura lógica actual

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
- `src/server/rateLimit.ts` → `createRateLimiter` factory; 4 tiers; Map en memoria con sweep
- `src/server/telegramAccess.ts` → resolución de identidad/permiso Telegram
- `src/server/telegramMedia.ts` → `extractFromPhoto()`, `extractFromMultiplePhotos()`, `inferMediaMimeType()`
- `src/server/telegramCompanyResolution.ts` → resolución de empresa por nombre desde bot
- `src/server/validation.ts` → `PendingExtractionData`, `isPendingExtractionData`, `parseReportExportRequest`
- `src/server/reportExports.ts` → generación real CSV/PDF
- `src/server/types/express.d.ts` → module augmentation: `req.session` tipado como `AppSession`
- `src/reports/shared.ts` → filtros y resolución de períodos compartidos
- `src/components/ui/ModalShell.tsx` → base modal reutilizable con a11y completo
- `src/components/ui/ConfirmModal.tsx` → diálogo de confirmación genérico; reemplaza `window.confirm`

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

## 7. Auth, permisos y colaboración

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

## 8. Dashboard web — estado real

Archivo principal: `src/DashboardApp.tsx`

### Tabs actuales reales
- Resumen
- Empresas
- Gastos
- Ingresos
- Informes
- Movimientos
- Configuración

### Cambios UX aplicados
- tab nav **móvil**: scroll horizontal compacto (icon + label, sin descripción)
- tab nav **md+**: grid con descripción
- `Gastos`: filtro por empresa + últimos 5; widget presupuesto oculto (`{false && ...}`)
- `Ingresos`: desglose por fuente + etiquetas + últimos 5
- `Movimientos`: filtro combinado empresa/tipo/moneda
- lo nuevo entra `conciliado` por defecto
- **dark mode completo** — todos los componentes responden a `[data-theme="dark"]`
- **tab activo persistido** en localStorage (`caja-chica:active-tab`) — refresh no pierde la posición

### ConfiguracionTab — secciones (orden actual)
1. **Preferencias**: tema (Claro/Oscuro/Sistema), moneda default (ARS/USD), empresa default, hora del recordatorio
2. **Miembros**: gestión de colaboradores del dashboard
3. **Cuenta**: nombre visible (display_name), exportar datos (GDPR), sesiones activas, borrar cuenta

---

## 9. Informes — estado actual

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

## 10. Backend HTTP — endpoints

Archivo principal: `src/server/app.ts`

### Salud
- `GET /api/health`

### Sesión / cuenta
- `GET /api/me` — retorna `id`, `email`, `role`, `status`, `display_name`, `notification_hour`
- `PATCH /api/me` — actualiza `display_name` y/o `notification_hour`
- `GET /api/me/export` — JSON dump (movimientos, empresas, categorías) para GDPR
- `GET /api/me/sessions` — lista sesiones auth activas + `currentSessionId` (via `get_my_sessions` RPC)
- `DELETE /api/me/sessions/:id` — revoca sesión puntual; 400 si el id es la sesión del caller (anti self-lockout)
- `DELETE /api/me` — elimina cuenta: borra membresías + `supabase.auth.admin.deleteUser()`

### Extracción IA
- `POST /api/extract` — rate limit 30 req/min por usuario, input max 2000 chars

### Movimientos
- `POST /api/movimientos`
- `GET /api/movimientos?limit=50&before=<ISO_DATE>`
- `DELETE /api/movimientos/:id` — soft delete con auditoría
- `DELETE /api/movimientos/last` — soft delete con auditoría
- `DELETE /api/movimientos/all` *(peligrosa, bloqueada por defecto — scopeada al dashboard del caller)*
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

### Telegram multiusuario
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

### Seguridad de la ruta peligrosa
`DELETE /api/movimientos/all` solo se habilita si:
- `ENABLE_DANGEROUS_ROUTES=true`
- header `X-Admin-Token` coincide con `ADMIN_API_TOKEN`
- **siempre scopeada al dashboard/owner del caller — nunca global**

---

## 11. Bot de Telegram — estado real

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

## 12. Cron jobs

### Recordatorio de notificación (hourly)
- cron: `0 * * * *` (cada hora, cambio desde `0 21 * * *`)
- filtra usuarios por `notification_hour === hora UTC actual`
- `for...of` con try/catch por usuario (no forEach)

### Recurrentes
- cron: `0 8 * * *`
- `for...of` con try/catch por entrada (no forEach)

---

## 13. Base de datos y SQL

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

## 14. Seguridad — estado post judgment-day 2026-05-04

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

### Deuda de seguridad restante
- (ninguna pendiente)

---

## 15. Infra, Docker y deploy

### Frontend
- Firebase Hosting / proyecto: `caja-chica-bot` (default en `.firebaserc`)
- URL prod: `https://caja-chica-bot.web.app`
- Headers de caché: `Cache-Control: public, max-age=31536000, immutable` en `/assets/**`
- Headers de seguridad: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`

### Backend
- Cloud Run / proyecto GCP: `caja-chica-bot`
- imagen: `gcr.io/caja-chica-bot/caja-chica`
- servicio Cloud Run: `caja-chica` región `us-west2`

### Checklist de deploy (estado actual)
| Paso | Estado |
|------|--------|
| `telegram_multi_user_phase.sql` en Supabase prod | ✔ hecho |
| `drive_oauth_phase.sql` en Supabase prod | ✔ hecho 2026-05-07 |
| `photo_ticket_phase.sql` en Supabase prod | ✔ hecho 2026-05-07 |
| Env vars Drive en Cloud Run | ✔ configuradas 2026-05-07 |
| Deploy backend Cloud Run | ✔ deployado 2026-05-07 |
| Deploy frontend Firebase Hosting | ✔ deployado 2026-05-08 en `caja-chica-bot.web.app` |
| `drop_pending_extractions.sql` en Supabase prod | ✔ aplicado 2026-05-08 |
| `user_settings_phase.sql` en Supabase prod | ✔ aplicado 2026-05-12 |
| Deploy frontend Firebase Hosting (user settings + security headers) | ✔ deployado 2026-05-12 |
| Deploy backend Cloud Run (user settings + session self-lockout) | ✔ deployado 2026-05-12 |

---

## 16. Variables de entorno

### Telegram
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`

### Supabase cliente (frontend)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Supabase servidor (requeridas — proceso falla si no están)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### API / dashboard
- `VITE_API_URL` ← **requerida en frontend** — sin fallback hardcodeado
- `ALLOWED_ORIGINS`
- `DASHBOARD_URL` ← requerida para Drive OAuth callback redirect

### Hardening
- `ENABLE_DANGEROUS_ROUTES`
- `ADMIN_API_TOKEN`

### IA
- `GEMINI_API_KEY`

### Google Drive ← configuradas en Cloud Run 2026-05-07
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI` ← debe ser `https://caja-chica-442790495206.us-west2.run.app/api/drive/callback`
- `TOKEN_ENCRYPTION_KEY` ← base64 de 32 bytes: `openssl rand -base64 32`

### Email (Resend)
- `RESEND_API_KEY` ← requerida para envío de emails de invitación

### Runtime general
- `PORT`
- `NODE_ENV`

---

## 17. Dark mode — arquitectura

- `[data-theme="dark"]` aplicado en `document.documentElement` desde `App.tsx`
- Variables: `--app-canvas`, `--app-surface-1/2/3/4`, `--app-border`, `--app-text-1/2/3/4`
- `@layer utilities` con `!important` mapea clases Tailwind → variables
- Base layer: `input`, `select`, `textarea`, `option` usan variables globalmente
- Tema `system` disponible desde user settings: `matchMedia` listener activo mientras preferencia === `'system'`

---

## 18. Testing real

### Estado actual
- `node --import tsx --test tests/**/*.test.ts` → **154/156 OK** (2 skip intencionales, 0 fail)
- Runner no cuelga — sweeps usan `unrefInterval`

### Cobertura relevante
- CORS, auth básica, invitaciones/admin, budgets, paginación
- dashboard compartido, restricciones viewer/editor
- superadmin: status toggles, force-logout, role changes, permission toggles
- Telegram access model multiusuario (incluyendo expiración de token, pivot guard)
- `can()` helper — 11 tests de permisos granulares
- edición y borrado auditado, conciliación
- export CSV/PDF, historial de exportaciones
- summary helpers, env loading
- resolución de empresa desde bot (telegramCompanyResolution)
- `inferMediaMimeType` — mime explicit, extension fallback, null cases
- `parsePhotoExtractionResult` / `parseMultiPhotoExtractionResult` — JSON válido/inválido, confidence clamping, markdown fences
- `extractFromPhoto` mock integration — upload/generateContent/delete lifecycle, retry con handwritten prompt
- `MediaGroupBuffer` — debounce, flush, multi-group isolation
- Drive OAuth: encrypt/decrypt round-trip, canConnectDrive por role, canExportDrive editor+permiso, callback state, disconnect
- Rate limiter: allow/block, headers X-RateLimit-*, key isolation, window reset
- Extraction review store: TTL, editingField transitions, buildReviewCardText, buildReviewKeyboard
- User settings: display_name, notification_hour, sessions list + self-lockout guard, export, delete account

---

## 19. Decisiones de arquitectura importantes

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
18. `pending_extractions` tabla borrada — sesiones foto/ticket viven en Map en memoria. **Single-instance invariant**: Cloud Run max=1. Si autoscale > 1, migrar Map → tabla Supabase.
19. Tests corren con `node --import tsx --test` — Node.js runner nativo, sin Jest/Vitest
20. `DELETE /api/me/sessions/:id` compara contra `AppSession.sessionId` (claim JWT) — previene auto-lockout sin tabla de sesiones propias
21. Assets Vite tienen hash de contenido en el nombre → `max-age=31536000, immutable` es seguro

---

## 20. Próximos pasos recomendados

### Prioridad media (features pendientes)
1. CUIT matching en `resolveTelegramCompany()` — columna `empresas.cuit` existe, lógica no implementada
2. Presupuesto UI — oculto con `{false && ...}` en `GastosTab.tsx`; API y datos intactos

### Prioridad baja (cosmético)
- (ninguna pendiente)

---

## 21. Archivos clave para abrir primero

- `CLAUDE.md`
- `src/DashboardApp.tsx`
- `src/server/app.ts`
- `src/server/permissions.ts`
- `src/server/rateLimit.ts`
- `src/server/telegramAccess.ts`
- `src/server/telegramMedia.ts`
- `src/server/extractionReview.ts`
- `src/server/mediaGroupBuffer.ts`
- `src/server/drive.ts`
- `src/server/gemini.ts`
- `src/server/email.ts`
- `src/server/reportExports.ts`
- `src/server/types/express.d.ts`
- `src/reports/shared.ts`
- `src/services/api.ts`
- `src/components/ui/ModalShell.tsx`
- `src/components/ui/ConfirmModal.tsx`
- `src/components/dashboard/tabs/ConfiguracionTab.tsx`
- `server.ts`
- `tests/api.test.ts`

---

## 22. Prompt correcto para retomar

> Leé `CLAUDE.md`. Frontend en `caja-chica-bot.web.app`, backend en Cloud Run (`caja-chica-bot`). Tests: 154/156 (0 fail). Sin pendientes de infra. Último commit: `5274ae4` (Firebase security headers). Próximo: CUIT matching en bot Telegram.
