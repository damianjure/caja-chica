# CLAUDE.md

## Fuente de verdad única — 2026-05-07 (actualizado post foto/tickets + deploy completo)

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
- **Email de invitaciones** — ✔ implementado (2026-05-07):
  - invitaciones de app y de dashboard disparan email vía Resend
  - `src/server/email.ts`: `sendAppInvitationEmail()` y `sendDashboardInvitationEmail()`
- **Auditoría de seguridad completa 2026-05-04 (judgment-day)** — ver sección 14

### Pendiente
1. Deploy frontend a Firebase Hosting (código listo, no se deployó en última sesión)
2. CUIT matching en `resolveTelegramCompany()` — columna existe en DB, lógica no implementada

---

## 2. URLs, proyectos y entornos reales

### Frontend producción
- [https://balancediario.web.app](https://balancediario.web.app)

### Backend producción
- [https://boteado-bot-442790495206.us-west2.run.app](https://boteado-bot-442790495206.us-west2.run.app)

### Firebase project
- `balancediario`

### Google Cloud project del backend
- `caja-chica-bot`

### Supabase real usado por la app
- proyecto: `dezgusgxotihxkfkxico`

### OJO
NO usar `mlvounduwzfnkldbahnl` para esta app.
NO usar `unidos-para-servir` — es otro proyecto Firebase, no el de Boteado.

---

## 3. Reglas prácticas de trabajo sobre este repo

### Regla fuerte
- **Nunca build después de cambios** salvo instrucción explícita que lo justifique.

### Deploy manual
```bash
# Frontend
npm run build
firebase use balancediario   # verificar proyecto antes
firebase deploy --only hosting

# Backend
gcloud config set project caja-chica-bot
gcloud builds submit --tag gcr.io/caja-chica-bot/boteado-bot --region us-west2
gcloud run deploy boteado-bot --image gcr.io/caja-chica-bot/boteado-bot --region us-west2 --platform managed --quiet
```

### Estado de validación local más reciente
- `npm test` → **109/109 OK** (runner Node.js v25 cuelga al terminar — comportamiento conocido, no es un fallo)
- `npm run lint` → **OK**
- commit HEAD: `df391b2`

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

### Backend
- Express
- TypeScript
- tsx
- grammY
- node-cron
- dotenv
- **googleapis** ← Drive integration

### Datos / Infra
- Supabase
- Firebase Hosting
- Docker
- Cloud Run

### IA
- `@google/genai`

### Importante
- **no hay librería externa de PDF** — generador mínimo propio en `src/server/reportExports.ts`
- **no hay librería externa de rate limiting** — Map en memoria
- **no hay librería de cifrado** — AES-256-CBC vía `node:crypto` stdlib

---

## 5. Estructura importante del proyecto

```text
/Users/damian/Dev/Boteado
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
│   │   ├── app.ts
│   │   ├── drive.ts               ← Drive OAuth + upload + AES-256-CBC encrypt/decrypt
│   │   ├── email.ts               ← sendAppInvitationEmail() + sendDashboardInvitationEmail() via Resend
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── extractionReview.ts    ← inline keyboard confirm/edit flow para fotos; TTL 10min
│   │   ├── gemini.ts              ← prompts texto + RECEIPT/HANDWRITTEN/MULTI_RECEIPT para fotos
│   │   ├── mediaGroupBuffer.ts    ← debounce genérico para álbumes Telegram (1500ms)
│   │   ├── permissions.ts         ← can(member, action) helper
│   │   ├── reportExports.ts
│   │   ├── telegramAccess.ts      ← resolveViaNewLinks() + fallback legacy
│   │   ├── telegramAudio.ts       ← extracción desde audio/voz
│   │   ├── telegramCompanyResolution.ts ← resolución de empresa por nombre
│   │   ├── telegramMedia.ts       ← extractFromPhoto() + extractFromMultiplePhotos() + inferMediaMimeType()
│   │   └── validation.ts          ← PendingExtractionData + isPendingExtractionData + parseReportExportRequest
│   └── services/
│       ├── api.ts
│       └── supabase.ts
├── tests/
│   ├── api.test.ts
│   ├── auth-redirect.test.ts
│   ├── company-assignment.test.ts
│   ├── dashboardSummary.test.ts
│   ├── env.test.ts
│   ├── mediaGroupBuffer.test.ts   ← 5 tests del debounce buffer
│   ├── permissions.test.ts        ← 11 tests de can()
│   ├── summary.test.ts
│   ├── telegramAccess.test.ts     ← incluye tests multiusuario
│   ├── telegramAudio.test.ts
│   └── telegramMedia.test.ts      ← 14 tests: inferMediaMimeType, parse functions, extractFromPhoto mock
├── supabase_schema.sql
├── phase1_supabase_patch.sql
├── report_exports_phase.sql              ✔ aplicado en prod
├── fix_auth_hook.sql                     ✔ aplicado en prod
├── shared_dashboard_phase.sql            ✔ aplicado en prod
├── shared_dashboard_invitations_phase.sql ✔ aplicado en prod
├── shared_dashboard_cutover_final.sql    ✔ aplicado en prod
├── mutations_audit_soft_delete_phase.sql ✔ aplicado en prod
├── security_definer_hook_patch.sql       ✔ aplicado en prod 2026-05-03
├── security_hardening_phase.sql          ✔ aplicado en prod 2026-05-03
├── soft_delete_movimientos_phase.sql     ✔ aplicado en prod 2026-05-03
├── telegram_multi_user_phase.sql         ✔ aplicado en prod 2026-05-04
├── drive_oauth_phase.sql                 ✔ aplicado en prod 2026-05-07
├── photo_ticket_phase.sql                ✔ aplicado en prod 2026-05-07
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
- `canUseDrive(scope)`: solo `membershipRole === null` (legacy) o `membershipRole === 'owner'`
- En report-export, editor con `export_drive: true` también puede — resuelve owner's `user_id` de `dashboard_members` para buscar el token
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

Archivo principal:
- `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`

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

Archivo principal: `/Users/damian/Dev/Boteado/src/server/app.ts`

### Salud
- `GET /api/health`

### Sesión
- `GET /api/me`

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

### Seguridad de la ruta peligrosa
`DELETE /api/movimientos/all` solo se habilita si:
- `ENABLE_DANGEROUS_ROUTES=true`
- header `X-Admin-Token` coincide con `ADMIN_API_TOKEN`
- **siempre scopeada al dashboard/owner del caller — nunca global**

---

## 11. Bot de Telegram — estado real

Runtime: `/Users/damian/Dev/Boteado/server.ts`

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

### Recordatorio diario
- cron: `0 21 * * *`
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

### Deuda de seguridad restante (baja prioridad)
- `(req as any).session` — 40+ casts sin tipo en app.ts
- limpieza de nombres `VITE_*` en backend/server env
- sin rate limiting global (solo en `/api/extract`)

---

## 15. Infra, Docker y deploy

### Frontend
- Firebase Hosting / proyecto: `balancediario`
- verificar con `firebase use balancediario` antes de deploy

### Backend
- Cloud Run / proyecto GCP: `caja-chica-bot`
- imagen: `gcr.io/caja-chica-bot/boteado-bot`
- servicio Cloud Run: `boteado-bot` región `us-west2`

### Checklist de deploy (estado actual)
| Paso | Estado |
|------|--------|
| `telegram_multi_user_phase.sql` en Supabase prod | ✔ hecho |
| `drive_oauth_phase.sql` en Supabase prod | ✔ hecho 2026-05-07 |
| `photo_ticket_phase.sql` en Supabase prod | ✔ hecho 2026-05-07 |
| Env vars Drive en Cloud Run | ✔ configuradas 2026-05-07 |
| Deploy backend Cloud Run | ✔ deployado 2026-05-07 |
| Deploy frontend Firebase Hosting | ⚠ **PENDIENTE** (código listo, nunca deployado en esta sesión) |

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
- `GOOGLE_DRIVE_REDIRECT_URI` ← debe ser `https://boteado-bot-.../api/drive/callback`
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

---

## 18. Testing real

### Estado actual
- `npm test` / `node --import tsx --test tests/**/*.test.ts` → **109/109 OK**
- El runner de Node.js v25 cuelga al terminar (handles Express abiertos) — esto es preexistente, no es un fallo

### Cobertura relevante
- CORS, auth básica, invitaciones/admin, budgets, paginación
- dashboard compartido, restricciones viewer/editor
- Telegram access model multiusuario (incluyendo expiración de token, pivot guard)
- can() helper — 11 tests de permisos granulares
- edición y borrado auditado, conciliación
- export CSV/PDF, historial de exportaciones
- summary helpers, env loading
- `inferMediaMimeType` — mime explicit, extension fallback, null cases
- `parsePhotoExtractionResult` / `parseMultiPhotoExtractionResult` — JSON válido/inválido, confidence clamping, markdown fences
- `extractFromPhoto` mock integration — upload/generateContent/delete lifecycle, retry con handwritten prompt
- `MediaGroupBuffer` — debounce, flush, multi-group isolation

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
14. Maps en memoria (sessions, rate limit, OAuth state): sweep periódico cada 5 min
15. INSERT Telegram invite sin upsert — partial index de PostgREST es unreliable para onConflict
16. foto → dos prompts en cascada: RECEIPT primero, HANDWRITTEN si confidence < 0.5 — no se pide al usuario que reenvíe
17. álbumes Telegram: debounce 1500ms porque cada foto llega en update separado; un solo call a Gemini para el batch
18. `pending_extractions` en DB existe pero no se usa — estado in-memory es suficiente para el TTL corto

---

## 20. Próximos pasos recomendados

### Prioridad inmediata
1. Deploy frontend Firebase Hosting: `npm run build` → `firebase use balancediario` → `firebase deploy --only hosting`

### Prioridad media (features pendientes)
2. CUIT matching en `resolveTelegramCompany()` — columna `empresas.cuit` existe, falta usarla en la resolución
3. Presupuesto UI — actualmente oculto con `{false && ...}` en `GastosTab.tsx`; API y datos intactos

### Prioridad baja (deuda técnica)
4. Rate limiting global (actualmente solo en `/api/extract`)
5. Tipado correcto de `session` en Express (`(req as any).session` → tipo propio)
6. Limpiar env names viejos `VITE_*` en backend/server

---

## 21. Archivos clave para abrir primero

- `/Users/damian/Dev/Boteado/CLAUDE.md`
- `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`
- `/Users/damian/Dev/Boteado/src/server/app.ts`
- `/Users/damian/Dev/Boteado/src/server/permissions.ts`
- `/Users/damian/Dev/Boteado/src/server/telegramAccess.ts`
- `/Users/damian/Dev/Boteado/src/server/telegramMedia.ts`
- `/Users/damian/Dev/Boteado/src/server/extractionReview.ts`
- `/Users/damian/Dev/Boteado/src/server/mediaGroupBuffer.ts`
- `/Users/damian/Dev/Boteado/src/server/drive.ts`
- `/Users/damian/Dev/Boteado/src/server/gemini.ts`
- `/Users/damian/Dev/Boteado/src/server/email.ts`
- `/Users/damian/Dev/Boteado/src/server/reportExports.ts`
- `/Users/damian/Dev/Boteado/src/reports/shared.ts`
- `/Users/damian/Dev/Boteado/src/services/api.ts`
- `/Users/damian/Dev/Boteado/server.ts`
- `/Users/damian/Dev/Boteado/tests/api.test.ts`

---

## 22. Prompt correcto para retomar

> Leé `/Users/damian/Dev/Boteado/CLAUDE.md`. Backend deployado en Cloud Run. Pendiente: deploy frontend con `npm run build` → `firebase use balancediario` → `firebase deploy --only hosting`.
