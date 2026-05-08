# AGENTS.md

## Fuente de verdad única — 2026-05-07 (actualizado post deploy + photo extraction + Drive refactor)

Este es el **único archivo de contexto operativo** del proyecto.

A partir de ahora:
- usar **solo** `/Users/damian/Dev/Boteado/AGENTS.md` para retomar trabajo
- no usar `cloud.md` como fuente separada
- registrar acá estado real, decisiones, deuda, rutas, deploy, SQL pendientes y próximos pasos

---

## 1. Resumen ejecutivo real

**Boteado** es una app para registrar y consultar movimientos financieros en lenguaje natural para contexto rioplatense.

El producto tiene tres caras:
- dashboard web en React/Vite
- backend HTTP en Express/TypeScript
- bot de Telegram en grammY

Integraciones principales:
- Gemini (`@google/genai`) para extracción desde texto libre y OCR de tickets/facturas
- Supabase para auth, datos y realtime
- Firebase Hosting para frontend productivo
- Cloud Run / Node runtime para backend y bot
- Google Drive API (`googleapis`) para exportación de informes
- Resend para notificaciones por email

### Estado real validado (2026-05-07)
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
- **Fase 2 Informes** — en producción (dentro de pestaña Empresas):
  - filtros: día / semana / mes / rango / empresa / tipo / moneda
  - exportación CSV y PDF real (generador propio, sin deps externos)
  - historial persistido en `report_exports`
  - **Google Drive** — integración completa:
    - OAuth2 con `drive.file` scope
    - tokens guardados cifrados en `drive_connections` (AES-256-CBC)
    - `owner` puede conectar Drive; `editor` con permiso `export_drive` puede usarlo
    - `viewer` no puede subir
    - destino `local` o `drive` al exportar
    - historial muestra badge con link directo si destino=drive
- **Bot Telegram Informes** — en código (pendiente deploy):
  - `/informes` y `/exportar` → flujo guiado período/formato/destino
  - soporta: día / semana / mes / año / rango personalizado
  - formatos: CSV y PDF
  - destino: local (envía archivo) o Drive (sube y manda link)
- **Bot /recurrente** — flujo guiado conversacional:
  - monto → tipo → moneda → frecuencia → descripción → insert Supabase
  - soporta diario / semanal / mensual
  - reemplaza el comando one-shot anterior
- **Bot Photo/PDF extraction** — en código (pendiente deploy):
  - Gemini OCR para tickets, facturas y documentos escaneados
  - soporta foto individual, álbum de Telegram (media group) y documento PDF/imagen
  - `MediaGroupBuffer` con debounce 1.5s para álbumes
  - flujo de revisión interactivo: card con datos extraídos → editar campos → confirmar/cancelar
  - sesiones de revisión en `extractionReview.ts` con TTL 10 min
  - `PendingExtractionData` con campos: monto, empresa, categoría, descripción, tipo, moneda, fecha
- **Telegram multiusuario (Bloque 2)** — en código (pendiente deploy):
  - flujo doble-factor: invite token → confirmación del owner → vínculo activo
  - tabla `telegram_links` con estados `pending_owner_confirm → active → revoked`
  - tokens de invitación one-shot con TTL 30 min en `telegram_invite_tokens`
  - `requireTelegramCan()` con checks de permisos para cada operación del bot
  - editor con `invite_telegram` puede generar links de vinculación Telegram
- **Email notifications (Resend)** — en código (pendiente deploy):
  - `src/server/email.ts` con templates HTML para invitaciones
  - se envía email al crear invitación de app (`sendAppInvitationEmail`)
  - se envía email al crear invitación de dashboard (`sendDashboardInvitationEmail`)
  - env vars: `RESEND_API_KEY`, `FROM_EMAIL`
- `setMyCommands` con retry automático (3 intentos, 2s entre intentos)
- **Dark mode completo** — CSS vars + `!important` override cubre todo
- **Auditoría de seguridad completa 2026-05-03** — ver sección 14
- **setInterval con `.unref()`** — todos los sweep intervals usan `unrefInterval()` para no colgar el proceso Node

### Pendiente
- deploy de todos los cambios post-sprints (frontend + backend)
- aplicar SQL pendientes en prod: `drive_oauth_phase.sql`, `photo_ticket_phase.sql`, `telegram_multi_user_phase.sql`

---

## 2. URLs, proyectos y entornos reales

### Frontend producción
- [https://caja-chica-bot.web.app](https://caja-chica-bot.web.app)

### Backend producción
- [https://boteado-bot-442790495206.us-west2.run.app](https://boteado-bot-442790495206.us-west2.run.app)

### Firebase project
- `caja-chica-bot`

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
- **Nunca build después de cambios** salvo instrucción explícita que lo justifique y no choque con reglas del repo.

### Implicancia real
- no asumir deploy automático como siguiente paso
- si publicar frontend/backend requiere build, tratarlo como acción deliberada
- antes de cualquier acción irreversible o costosa, verificar contexto real primero

### Deploy manual
```bash
# Frontend
npm run build
firebase use caja-chica-bot   # verificar proyecto antes
firebase deploy --only hosting

# Backend
gcloud config set project caja-chica-bot
gcloud builds submit --tag gcr.io/caja-chica-bot/boteado-bot --region us-west2
gcloud run deploy boteado-bot --image gcr.io/caja-chica-bot/boteado-bot --region us-west2 --platform managed --quiet
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
- **googleapis** — Drive integration
- **resend** — email notifications
- **@google/genai@^1.29.0** — Gemini extraction + OCR

### Datos / Infra
- Supabase
- Firebase Hosting
- Docker
- Cloud Run

### IA
- `@google/genai`

### Importante
- **no hay librería externa de PDF instalada** — generador mínimo propio en `src/server/reportExports.ts`
- **no hay librería externa de rate limiting** — implementación propia en memoria (Map)
- **no hay librería de cifrado** — AES-256-CBC vía `node:crypto` stdlib
- **no hay librería externa de email** — Resend SDK con templates HTML inline

---

## 5. Estructura importante del proyecto

```text
/Users/damian/Dev/Boteado
├── AGENTS.md
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
│   │   ├── CollaborationPanel.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── ThemeToggle.tsx
│   │   └── dashboard/
│   │       ├── Charts.tsx
│   │       ├── LoadingStates.tsx
│   │       ├── primitives.tsx
│   │       └── tabs/
│   │           ├── EmpresasTab.tsx    ← incluye Informes como sección interna
│   │           ├── GastosTab.tsx
│   │           ├── InformesTab.tsx    ← usado como subcomponente dentro de EmpresasTab
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
│   │   ├── drive.ts               ← Drive OAuth + upload + encrypt/decrypt
│   │   ├── email.ts               ← nuevo: Resend email notifications
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── extractionReview.ts    ← nuevo: sesiones de revisión de extracción (fotos/PDF)
│   │   ├── gemini.ts
│   │   ├── mediaGroupBuffer.ts    ← nuevo: buffer de álbumes Telegram con debounce
│   │   ├── reportExports.ts
│   │   ├── telegramAccess.ts      ← actualizado: multi-user + permissions
│   │   ├── telegramAudio.ts       ← nuevo: procesamiento de audio Telegram
│   │   ├── telegramMedia.ts       ← nuevo: extracción desde foto/PDF con Gemini
│   │   └── validation.ts
│   └── services/
│       ├── api.ts
│       └── supabase.ts
├── tests/
│   ├── api.test.ts
│   ├── auth-redirect.test.ts
│   ├── company-assignment.test.ts
│   ├── dashboardSummary.test.ts
│   ├── env.test.ts
│   ├── mediaGroupBuffer.test.ts
│   ├── permissions.test.ts
│   ├── summary.test.ts
│   ├── telegram-access.test.ts
│   ├── telegram-audio.test.ts
│   ├── telegram-company-resolution.test.ts
│   └── telegram-media.test.ts
├── supabase_schema.sql
├── phase1_supabase_patch.sql
├── report_exports_phase.sql              ✔ prod
├── fix_auth_hook.sql                     ✔ prod
├── shared_dashboard_phase.sql            ✔ prod
├── shared_dashboard_invitations_phase.sql ✔ prod
├── shared_dashboard_cutover_final.sql    ✔ prod
├── mutations_audit_soft_delete_phase.sql ✔ prod
├── security_definer_hook_patch.sql       ✔ prod 2026-05-03
├── security_hardening_phase.sql          ✔ prod 2026-05-03
├── soft_delete_movimientos_phase.sql     ✔ prod 2026-05-03
├── drive_oauth_phase.sql                 ⚠ PENDIENTE aplicar en prod
├── photo_ticket_phase.sql                ⚠ PENDIENTE aplicar en prod
├── telegram_multi_user_phase.sql         ⚠ PENDIENTE aplicar en prod
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
- `src/server/drive.ts` → Drive OAuth helpers + AES-256-CBC encrypt/decrypt
- `src/server/email.ts` → Resend email notifications (invitaciones de app y dashboard)
- `src/server/errors.ts` → helper compartido para errores de schema Supabase
- `src/server/extractionReview.ts` → sesiones de revisión de extracción (fotos/PDF) con TTL
- `src/server/validation.ts` → validación de borde + tipos de datos de extracción
- `src/server/gemini.ts` → prompt y parseo de Gemini (con whitelist de intents)
- `src/server/telegramAccess.ts` → resolución de identidad/permiso Telegram + permissions
- `src/server/telegramMedia.ts` → extracción desde foto/PDF con Gemini OCR
- `src/server/mediaGroupBuffer.ts` → buffer de álbumes Telegram con debounce configurable
- `src/server/telegramAudio.ts` → procesamiento de audio de Telegram
- `src/server/reportExports.ts` → generación real CSV/PDF
- `src/reports/shared.ts` → filtros y resolución de períodos compartidos

### 6.2 Flujo principal
1. usuario escribe texto libre, sube foto/ticket, o usa dashboard
2. frontend o bot llama backend
3. backend usa Gemini cuando hace falta extraer intención/datos (texto libre + OCR de imágenes)
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
- `editor` → puede tener permisos granulares vía JSONB `permissions`
- `viewer` → puede leer pero no escribir

Permisos granulares de editor (JSONB en `dashboard_members.permissions`):
- `export_drive` — puede exportar informes al Drive del owner
- `delete_any` — puede borrar cualquier movimiento/empresa
- `invite_telegram` — puede generar tokens de vinculación Telegram

### 6.4 Drive — modelo de acceso (refactorizado 2026-05-07)
- `canConnectDrive`: solo si `scope.membershipRole === null || scope.membershipRole === 'owner'`
- `canExportDrive`: `canConnectDrive` O editor con `permissions.export_drive === true`
- `resolveDriveOwnerUserId`: resuelve el user_id del owner del dashboard para operar con su conexión Drive
- tokens OAuth cifrados con AES-256-CBC usando `TOKEN_ENCRYPTION_KEY` (env)
- `pendingDriveOAuthStates`: Map en memoria con TTL 5 min (CSRF state)
- callback `/api/drive/callback` no requiere sesión (redirect desde Google)

### 6.5 Extracción desde fotos/PDF — flujo
1. Usuario envía foto, álbum (media group) o documento al bot
2. `MediaGroupBuffer` acumula imágenes del mismo álbum con debounce 1.5s
3. Gemini extrae datos (OCR + interpretación semántica)
4. Se crea `PendingExtraction` con TTL 10 min
5. Bot muestra card de review con inline keyboard (editar campos / confirmar / cancelar)
6. Usuario puede editar campos individuales (monto, empresa, categoría, descripción, tipo, moneda)
7. Al confirmar → inserta movimiento, elimina la extracción pendiente
8. `extractionReviewSweep` limpia extracciones expiradas cada 5 min

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
- permisos: `viewer` → solo ver / `editor` → ver + cargar datos + permisos granulares

### Email notifications
- Al crear invitación de app: se envía email con link de activación
- Al crear invitación de dashboard: se envía email con link para unirse
- Templates HTML con diseño responsive, instrucciones paso a paso
- Si `RESEND_API_KEY` no está seteada → se omite el envío sin error fatal (graceful fallback)
- `FROM_EMAIL` default: `Boteado <onboarding@resend.dev>`

### Estado conceptual
El modelo de Telegram multiusuario compartido está implementado en código (Bloque 2).
La parte pendiente es deploy y validación end-to-end.

---

## 8. Dashboard web — estado real

Archivo principal:
- `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`

### Tabs actuales reales
- Resumen
- Movimientos
- Gastos
- Ingresos
- Empresas (incluye sección de Informes y Exportaciones)

### Cambio 2026-05-07: reestructuración de tabs
- **Informes** ya no es tab independiente — está dentro de **Empresas**
- `DashboardTab` type: `'resumen' | 'movimientos' | 'gastos' | 'ingresos' | 'empresas' | 'superadmin'`
- `InformesTab` se usa como subcomponente de `EmpresasTab`
- Prop `canConnectDrive` viaja por EmpresasTab → InformesTab (botón "Conectar Drive" solo visible para owners)

### Cambios UX aplicados
- tab nav **móvil**: scroll horizontal compacto (icon + label, sin descripción)
- tab nav **md+**: grid con descripción (comportamiento anterior)
- se sacó la pestaña `Balance`
- `Pulso mensual` separado en ARS y USD
- barras de resumen/empresas/ingresos con proporciones correctas
- `Gastos`: filtro por empresa + últimos 5; widget presupuesto oculto (`{false && ...}`)
- `Ingresos`: desglose por fuente + etiquetas + últimos 5
- `Movimientos`: filtro combinado empresa/tipo/moneda
- badge `Pendiente/Conciliado` sacado de cards
- lo nuevo entra `conciliado` por defecto
- **dark mode completo** — todos los componentes responden a `[data-theme="dark"]`

### Modal de asignación de empresa
Si Gemini devuelve un único movimiento sin empresa → obliga a elegir antes de persistir.

---

## 9. Informes — estado actual

### Ubicación
Dentro de la pestaña **Empresas** (ya no es tab independiente).

### Implementado (pendiente deploy)
- filtros: día / semana / mes / rango / empresa / tipo / moneda
- exportación CSV y PDF real
- historial persistido en `report_exports`
- descarga web desde base64
- **Google Drive**:
  - botón "Conectar Drive" visible solo para `owner` (usa `canConnectDrive`)
  - editor con permiso `export_drive` puede exportar a Drive del owner (usa `canUseDrive`)
  - URL param `?driveConnected=true` / `?driveError=...` manejados al volver del OAuth
  - destino `local` o `drive` al exportar
  - historial muestra badge `Drive` con `ExternalLink` si `destination === "drive"`

### SQL pendiente en prod
```
drive_oauth_phase.sql  ← aplicar ANTES de deployar backend
```
Crea `drive_connections` + altera `report_exports` para agregar `destination`, `drive_file_id`, `drive_url`.

### Archivos principales
- `src/components/dashboard/tabs/EmpresasTab.tsx`
- `src/components/dashboard/tabs/InformesTab.tsx`
- `src/reports/shared.ts`
- `src/server/reportExports.ts`
- `src/server/drive.ts`
- `src/server/app.ts`
- `src/services/api.ts`

---

## 10. Backend HTTP — estado real

Archivo principal:
- `/Users/damian/Dev/Boteado/src/server/app.ts`

### Endpoints importantes

#### Salud
- `GET /api/health`

#### Sesión
- `GET /api/me`

#### Extracción IA
- `POST /api/extract` — rate limit 30 req/min por usuario, input max 2000 chars

#### Movimientos
- `POST /api/movimientos`
- `GET /api/movimientos?limit=50&before=<ISO_DATE>`
- `DELETE /api/movimientos/:id` — soft delete con auditoría
- `DELETE /api/movimientos/last` — soft delete con auditoría
- `DELETE /api/movimientos/all` *(peligrosa, bloqueada por defecto)*
- `PATCH /api/movimientos/:id`
- `POST /api/movimientos/:id/conciliar`

#### Empresas
- `POST /api/empresas`
- `GET /api/empresas`
- `DELETE /api/empresas/:id`
- `PATCH /api/empresas/:id`

#### Categorías
- `GET /api/categorias`
- `DELETE /api/categorias/:id`

#### Presupuestos
- `POST /api/presupuestos`
- `GET /api/presupuestos?period=YYYY-MM`

#### Informes
- `POST /api/report-exports`
- `GET /api/report-exports`

#### Google Drive
- `GET /api/drive/status` — usa `canExportDrive` (owners + editors autorizados)
- `GET /api/drive/auth-url` — requiere `canConnectDrive` (solo owners)
- `GET /api/drive/callback` ← no requiere auth (redirect OAuth)
- `DELETE /api/drive/disconnect` — requiere `canConnectDrive` (solo owners)

#### Bot / vínculo Telegram
- `GET /api/bot/connection`
- `POST /api/bot/connection/link-token`
- `POST /api/bot/invite-token` ← nuevo: genera token de invitación Telegram para editor/viewer
- `POST /api/bot/invite-token/:token/confirm` ← nuevo: owner confirma vínculo Telegram de miembro

#### Admin
- `GET /api/admin/users`
- `GET /api/admin/invitations`
- `POST /api/admin/invitations`
- `POST /api/admin/invitations/:id/revoke`

#### Dashboard compartido
- `GET /api/dashboard/members`
- `POST /api/dashboard/invitations`
- `POST /api/dashboard/invitations/:id/revoke`

### Seguridad de la ruta peligrosa
`DELETE /api/movimientos/all` solo se habilita si:
- `ENABLE_DANGEROUS_ROUTES=true`
- header `X-Admin-Token` coincide con `ADMIN_API_TOKEN`

---

## 11. Bot de Telegram — estado real

Runtime:
- `/Users/damian/Dev/Boteado/server.ts`

### Capacidades principales actuales
- `/start`
- `/menu`
- `/informes` / `/exportar` → flujo guiado período/formato/destino (reemplaza `/informe` y `exportar_csv` legacy)
- `/empresas`
- `/categorias`
- `/agregarempresa`
- `/borrar`
- `/dashboard`
- `/buscar`
- `/saldos`
- `/recurrente` → flujo guiado conversacional (monto→tipo→moneda→frecuencia→descripción)
- edición del último ingreso/egreso
- borrado/soft delete de movimiento con confirmación
- borrado/soft delete de empresa con confirmación

### Photo/PDF extraction (nuevo — pendiente deploy)
- Soporta `message:photo` (foto individual y álbumes/media groups)
- Soporta `message:document` (PDF, imágenes como documento)
- `MediaGroupBuffer` acumula fotos del mismo álbum con debounce 1.5s
- Flujo de revisión con inline keyboard:
  - Bot muestra card con datos extraídos (tipo, monto, empresa, descripción, categoría, fecha)
  - Si confianza < 0.6 → warning visible
  - Botones: ✏️ Monto, 🏢 Empresa, 📂 Categ., 📝 Descripción, ↕️ Tipo, 💱 Moneda
  - Botones: ✅ Confirmar, ❌ Cancelar
- Al confirmar → inserta movimiento con `created_via: 'photo_extraction'`
- Callbacks con prefijo `er:` (extraction review) para editar/confirmar/cancelar
- Fuente type: `photo`, `pdf`, `handwritten`, `multi`
- Campos extraíbles: monto, empresa, categoría, descripción, tipo, moneda, fecha, confianza

### Flujo de Informes en bot
- Período: hoy / esta semana / este mes / este año / rango personalizado
- Año implementado como range `YYYY-01-01` a `YYYY-12-31` (no hay `year` en `ReportPeriod`)
- Rango: bot pide fecha_desde (YYYY-MM-DD) y fecha_hasta como texto libre
- Formato: CSV o PDF
- Destino: local (envía archivo) o Drive (sube y manda link — solo si `canUseDriveViaTelegram()`)
- Sessions: `pendingReportSessions` Map con TTL 15 min

### Flujo de Recurrente en bot
- Sessions: `pendingRecurrenceSessions` Map con TTL 10 min
- Pasos: monto (texto) → tipo (inline keyboard) → moneda → frecuencia → descripción (texto) → insert
- Insert usa `dashboard_id + created_by_user_id` si existe, else `owner_user_id` fallback

### Telegram multiusuario — modelo de vínculo (nuevo — pendiente deploy)
- Owners: vínculo one-shot legacy (`usuarios` table) o nuevo (`telegram_links`)
- Editor/Viewer: flujo doble-factor:
  1. Owner genera `telegram_invite_tokens` (TTL 30 min) para un miembro específico
  2. Miembro usa deep link `/start <token>` en Telegram
  3. Bot crea `telegram_links` con status `pending_owner_confirm`
  4. Owner recibe notificación y confirma/revoca desde el bot
  5. Una vez `active`, el miembro puede usar el bot con sus permisos

### Permisos del bot (nuevo)
- `requireTelegramCan()`: función que verifica permisos antes de cada operación
- Checks basados en `dashboard_members.role` y `permissions` JSONB
- Operaciones que requieren permisos específicos:
  - `invite_telegram` → generar tokens de invitación
  - `export_drive` → exportar a Drive
  - `delete_any` → borrar movimientos/empresas de otros

### setMyCommands
- Retry automático: 3 intentos, 2s entre intentos, log explícito en éxito/fallo

---

## 12. Cron jobs

Definidos en `/Users/damian/Dev/Boteado/server.ts`.

### Recordatorio diario
- cron: `0 21 * * *`
- manda recordatorio a usuarios con `reminders_enabled=true`

### Recurrentes
- cron: `0 8 * * *`
- revisa `recurrentes`
- inserta movimientos automáticos si corresponde

---

## 13. Base de datos y SQL

### Fuente general
- `/Users/damian/Dev/Boteado/supabase_schema.sql` — schema base de referencia, NO re-aplicar en prod

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
| `drive_oauth_phase.sql` | ⚠ **PENDIENTE** — aplicar antes de deploy |
| `photo_ticket_phase.sql` | ⚠ **PENDIENTE** — aplicar antes de deploy |
| `telegram_multi_user_phase.sql` | ⚠ **PENDIENTE** — aplicar antes de deploy |

### `drive_oauth_phase.sql` — qué hace
- Crea tabla `drive_connections` (`owner_user_id`, `dashboard_id`, `refresh_token_enc`, unique idx)
- Altera `report_exports` agregando `destination text check('local','drive')`, `drive_file_id`, `drive_url`

### `photo_ticket_phase.sql` — qué hace
- Agrega columna `cuit` a `empresas` (nullable, unique index con `WHERE cuit IS NOT NULL AND deleted_at IS NULL`)
- Crea tabla `pending_extractions` con RLS solo para service_role
- Campos: `chat_id`, `dashboard_id`, `user_id`, `owner_user_id`, `extracted_data jsonb`, `source_type`, `status`

### `telegram_multi_user_phase.sql` — qué hace
- Crea tabla `telegram_links` (flujo doble-factor para editor/viewer)
- Crea tabla `telegram_invite_tokens` (tokens one-shot con TTL 30 min)
- Agrega columna `permissions jsonb` a `dashboard_members` (permisos granulares para editor)
- Migra owners legacy a `telegram_links` (idempotente con ON CONFLICT DO NOTHING)

### Cero orphans verificado
`movimientos` y `empresas` — 0 rows con `dashboard_id IS NULL` en producción. El fallback legacy en código fue eliminado.

---

## 14. Seguridad — estado post-auditoría 2026-05-03

### Auditoría realizada
Auditoría completa de código + seguridad + DB. Se identificaron y resolvieron 7 críticos, 6 altos.

### Fixes aplicados

#### Código (deployado)
| Fix | Ubicación |
|-----|-----------|
| Eliminado fallback `owner_user_id` en `getScopeEntityById` | `src/server/app.ts` |
| Scope resolver filtra `status='active'` — revoked no pasan | `src/server/app.ts` |
| Prompt injection: max 2000 chars + whitelist intents Gemini | `src/server/validation.ts`, `src/server/gemini.ts` |
| Rate limit 30 req/min en `/api/extract` (Map en memoria, sin deps) | `src/server/app.ts` |
| Soft delete movimientos (antes era hard delete) | `src/server/app.ts`, `server.ts` |
| `DELETE /movimientos/last`: audit log + `console.error` | `src/server/app.ts` |
| Hard fail startup si `SUPABASE_SERVICE_ROLE_KEY` falta | `server.ts` |
| Expiración token Telegram validada en resolver (`.gt(expires_at)`) | `src/server/telegramAccess.ts` |
| `VITE_API_URL` requerida — eliminada URL hardcodeada producción | `src/services/api.ts` |
| `isMissingSchemaArtifactError` centralizada en `src/server/errors.ts` | `src/server/errors.ts` |
| `unrefInterval()` en todos los setInterval (rate limit sweep, Drive OAuth sweep, extraction sweep) — no cuelga el proceso | `src/server/app.ts`, `src/server/extractionReview.ts` |

#### SQL (aplicado en prod)
| Fix | Patch |
|-----|-------|
| `SECURITY DEFINER` + `set search_path = public` en hook auth | `security_definer_hook_patch.sql` |
| RLS policies unificadas con `(SELECT fn())` wrap — perf + cobertura `dashboard_id` | `security_hardening_phase.sql` |
| `audit_logs` null tenant leak cerrado | `security_hardening_phase.sql` |
| `report_exports` con branch `dashboard_id` en RLS | `security_hardening_phase.sql` |
| `deleted_at` + índices en `movimientos` | `soft_delete_movimientos_phase.sql` |

### Deuda de seguridad restante
- `(req as any).session` — 40+ casts sin tipo en app.ts (riesgo bajo, técnico)
- N+1 en `listDashboardMembers` — perf, no seguridad
- `syncPendingDashboardInvitations` en cada request — perf
- limpieza de nombres `VITE_*` en backend/server env
- sin rate limiting global (solo en `/api/extract`)

---

## 15. Infra, Docker y deploy

### Frontend
- Firebase Hosting
- config en `firebase.json`
- proyecto Firebase: `caja-chica-bot` — verificar con `firebase use caja-chica-bot` antes de deploy

### Backend
- Cloud Run / Node runtime
- proyecto GCP: `caja-chica-bot`
- contenedor: `Dockerfile` copia `server.ts` + `src/`
- imagen: `gcr.io/caja-chica-bot/boteado-bot`
- servicio Cloud Run: `boteado-bot` región `us-west2`

### Checklist antes de deployar (2026-05-07)
1. Aplicar `drive_oauth_phase.sql` en Supabase prod
2. Aplicar `photo_ticket_phase.sql` en Supabase prod
3. Aplicar `telegram_multi_user_phase.sql` en Supabase prod
4. Agregar nuevas env vars al Cloud Run (ver sección 16)
5. `npm run build` → `firebase deploy --only hosting`
6. Cloud Run build + deploy

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
- `DASHBOARD_URL`

### Hardening
- `ENABLE_DANGEROUS_ROUTES`
- `ADMIN_API_TOKEN`

### IA
- `GEMINI_API_KEY`

### Google Drive
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI` ← debe ser `https://boteado-bot-.../api/drive/callback`
- `TOKEN_ENCRYPTION_KEY` ← base64 de 32 bytes: `openssl rand -base64 32`

### Email (Resend) ← **nuevas, requeridas para notificaciones**
- `RESEND_API_KEY` ← API key de Resend. Si falta, emails se omiten sin error fatal.
- `FROM_EMAIL` ← default: `Boteado <onboarding@resend.dev>`

### Runtime general
- `PORT`
- `NODE_ENV`

### Deuda conocida
Todavía hay mezcla de nombres viejos `VITE_*` en server env (fallback `VITE_SUPABASE_URL` en `server.ts`). Conviene limpiarlo en una fase aparte.

---

## 17. Dark mode — arquitectura

Implementado en `src/index.css` con CSS custom properties:

- `[data-theme="dark"]` aplicado en `document.documentElement` desde `App.tsx`
- Variables: `--app-canvas`, `--app-surface-1/2/3/4`, `--app-border`, `--app-text-1/2/3/4`, colores semánticos (red, green, amber, blue)
- `@layer utilities` con `!important` mapea clases Tailwind → variables
- Cubre: `bg-white`, `bg-white/90` (color-mix), `bg-neutral-*`, `text-neutral-*`, `border-neutral-*`, `bg-red/green/amber/blue/rose-*`, etc.
- Base layer: `input`, `select`, `textarea`, `option` usan variables globalmente

---

## 18. Testing real

### Estado actual
- 11 archivos de test (incluyendo nuevos: `telegram-media.test.ts`, `mediaGroupBuffer.test.ts`, `permissions.test.ts`, `telegram-audio.test.ts`, `telegram-company-resolution.test.ts`, `dashboardSummary.test.ts`)

### Cobertura relevante
- CORS
- auth básica
- invitaciones/admin
- budgets
- paginación
- dashboard compartido
- restricciones `viewer`
- Telegram access model (incluyendo expiración de token)
- edición y borrado auditado
- conciliación
- export CSV/PDF
- historial de exportaciones
- helpers de summary
- carga `.env` y `.env.local`
- permisos granulares de editor
- MediaGroupBuffer y debounce de álbumes
- extracción de medios y resolución de empresas
- procesamiento de audio Telegram

### Comandos útiles
```bash
npm test
npm run lint
npm audit --omit=dev
```

---

## 19. Decisiones de arquitectura importantes

### Ya tomadas
1. invitados de un member comparten el mismo dashboard
2. permisos por dashboard: `viewer` y `editor`
3. Telegram debe vincularse al usuario real, no al dueño abstracto
4. los datos deben migrar a `dashboard_id` cuando exista contexto compartido
5. las mutaciones importantes deben quedar auditadas
6. soft delete de empresas Y movimientos es preferible a delete físico
7. Drive usa `drive.file` scope (no `drive` completo) — solo archivos creados por la app
8. `canConnectDrive` solo para owner; `canExportDrive` para owner + editor con permiso explícito
9. tokens OAuth cifrados con AES-256-CBC stdlib, sin deps externos
10. año en informes implementado como rango `YYYY-01-01 / YYYY-12-31` (no type nativo)
11. presupuesto: UI oculta con `{false && ...}`, datos y API intactos
12. **no existe fallback legacy en `getScopeEntityById`** — eliminado 2026-05-03
13. **Informes dentro de Empresas** — no es tab independiente, es sección de EmpresasTab
14. **Photo/PDF extraction via Gemini** — OCR + interpretación semántica, no parser rígido
15. **MediaGroupBuffer** — debounce 1.5s para álbumes de Telegram; evita procesar fotos sueltas antes de que llegue el grupo completo
16. **Extraction review flow** — siempre revisión humana antes de insertar; extracción automática nunca inserta directo
17. **Email via Resend** — graceful fallback si API key no está; no bloquea la operación
18. **Telegram invite tokens** — one-shot con TTL 30 min; flujo doble-factor para editor/viewer
19. **Permissions JSONB** — granular en `dashboard_members.permissions`; solo aplica a `editor`
20. **`unrefInterval()`** en todos los setInterval del servidor — evita que timers cuelguen el proceso Node

### Implicancia práctica
Si retomás colaboración compartida o Telegram multiusuario:
- NO arrancar por UI primero
- arrancar por schema + backend + permisos + resolución de identidad

---

## 20. Próximos pasos recomendados

### Prioridad inmediata (deploy pendiente)
1. Aplicar `drive_oauth_phase.sql` en Supabase prod
2. Aplicar `photo_ticket_phase.sql` en Supabase prod
3. Aplicar `telegram_multi_user_phase.sql` en Supabase prod
4. Agregar env vars de Drive, Resend al Cloud Run
5. Deploy frontend + backend

### Prioridad media
6. limpiar env names viejos `VITE_*` en backend/server
7. tipado correcto de `session` en Express (`(req as any).session` → tipo propio)
8. N+1 en `listDashboardMembers` → join en query
9. `syncPendingDashboardInvitations` → cachear en session en lugar de cada request

### Prioridad arquitectónica fuerte
10. validar end-to-end Telegram multiusuario con photo extraction en prod

---

## 21. Archivos clave para abrir primero

- `/Users/damian/Dev/Boteado/AGENTS.md`
- `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`
- `/Users/damian/Dev/Boteado/src/server/app.ts`
- `/Users/damian/Dev/Boteado/src/server/drive.ts`
- `/Users/damian/Dev/Boteado/src/server/email.ts`
- `/Users/damian/Dev/Boteado/src/server/extractionReview.ts`
- `/Users/damian/Dev/Boteado/src/server/telegramMedia.ts`
- `/Users/damian/Dev/Boteado/src/server/mediaGroupBuffer.ts`
- `/Users/damian/Dev/Boteado/src/server/errors.ts`
- `/Users/damian/Dev/Boteado/src/server/gemini.ts`
- `/Users/damian/Dev/Boteado/src/server/reportExports.ts`
- `/Users/damian/Dev/Boteado/src/reports/shared.ts`
- `/Users/damian/Dev/Boteado/src/services/api.ts`
- `/Users/damian/Dev/Boteado/server.ts`
- `/Users/damian/Dev/Boteado/tests/api.test.ts`

---

## 22. Prompt correcto para retomar

> Leé `/Users/damian/Dev/Boteado/AGENTS.md` y seguí desde el deploy pendiente: primero aplicar `drive_oauth_phase.sql`, `photo_ticket_phase.sql` y `telegram_multi_user_phase.sql` en Supabase, agregar env vars de Drive y Resend al Cloud Run, luego build y deploy frontend + backend.

O, si el foco es Telegram:

> Leé `/Users/damian/Dev/Boteado/AGENTS.md` y validá el flujo end-to-end de Telegram multiusuario con photo extraction.
