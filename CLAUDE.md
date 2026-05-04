# CLAUDE.md

## Fuente de verdad única — 2026-05-03 (actualizado post-sprints)

Este es el **único archivo de contexto operativo** del proyecto.

A partir de ahora:
- usar **solo** `/Users/damian/Dev/Boteado/CLAUDE.md` para retomar trabajo
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
- Gemini (`@google/genai`) para extracción desde texto libre
- Supabase para auth, datos y realtime
- Firebase Hosting para frontend productivo
- Cloud Run / Node runtime para backend y bot
- Google Drive API (`googleapis`) para exportación de informes

### Estado real validado (post-sprints)
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
- **Fase 2 Informes** — en producción:
  - filtros: día / semana / mes / rango / empresa / tipo / moneda
  - exportación CSV y PDF real (generador propio, sin deps externos)
  - historial persistido en `report_exports`
  - **Google Drive** — integración completa:
    - OAuth2 con `drive.file` scope
    - tokens guardados cifrados en `drive_connections` (AES-256-CBC)
    - solo `owner` puede conectar/usar Drive
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
- `setMyCommands` con retry automático (3 intentos, 2s entre intentos)
- **Dark mode completo** — CSS vars + `!important` override cubre todo:
  - `bg-white`, `bg-neutral-*`, `bg-red/green/amber/blue/rose-*`
  - `bg-white/90` con `color-mix`
  - form elements (`input`, `select`, `textarea`) con base layer global
- **Auditoría de seguridad completa 2026-05-03** — ver sección 14

### Pendiente
- cerrar experiencia Telegram multiusuario compartido de punta a punta
- deploy de todos los cambios post-sprints (frontend + backend)

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
- **Nunca build después de cambios** salvo instrucción explícita que lo justifique y no choque con reglas del repo.

### Implicancia real
- no asumir deploy automático como siguiente paso
- si publicar frontend/backend requiere build, tratarlo como acción deliberada
- antes de cualquier acción irreversible o costosa, verificar contexto real primero

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
- `npm test` → **63/63 OK**
- `npm run lint` → **OK**

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
- **googleapis** ← nuevo (Drive integration)

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
│   │   ├── CollaborationPanel.tsx
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
│   │   ├── drive.ts               ← nuevo: Drive OAuth + upload + encrypt/decrypt
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── gemini.ts
│   │   ├── reportExports.ts
│   │   ├── telegramAccess.ts
│   │   └── validation.ts
│   └── services/
│       ├── api.ts
│       └── supabase.ts
├── tests/
│   ├── api.test.ts
│   ├── auth-redirect.test.ts
│   ├── company-assignment.test.ts
│   ├── env.test.ts
│   ├── summary.test.ts
│   └── telegram-access.test.ts
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
├── drive_oauth_phase.sql                 ⚠ PENDIENTE aplicar en prod
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
- `src/server/errors.ts` → helper compartido para errores de schema Supabase
- `src/server/validation.ts` → validación de borde
- `src/server/gemini.ts` → prompt y parseo de Gemini (con whitelist de intents)
- `src/server/telegramAccess.ts` → resolución de identidad/permiso Telegram
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
- `editor`
- `viewer` → puede leer pero no escribir

### 6.4 Drive — modelo de acceso
- `canUseDrive`: solo si `linked.role === null || linked.role === 'owner'`
- tokens OAuth cifrados con AES-256-CBC usando `TOKEN_ENCRYPTION_KEY` (env)
- `pendingDriveOAuthStates`: Map en memoria con TTL 5 min (CSRF state)
- callback `/api/drive/callback` no requiere sesión (redirect desde Google)

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

### Estado conceptual
La parte web/backend ya avanzó bastante en dashboard compartido.
La parte pendiente fuerte sigue siendo **Telegram multiusuario sobre dashboard compartido** y terminar la experiencia completa alrededor de eso.

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

### Implementado (pendiente deploy)
- filtros: día / semana / mes / rango / empresa / tipo / moneda
- exportación CSV y PDF real
- historial persistido en `report_exports`
- descarga web desde base64
- **Google Drive**:
  - botón "Conectar Drive" visible solo para `owner`
  - URL param `?driveConnected=true` / `?driveError=...` manejados al volver del OAuth
  - destino `local` o `drive` al exportar
  - historial muestra badge `Drive` con `ExternalLink` si `destination === "drive"`

### SQL pendiente en prod
```
drive_oauth_phase.sql  ← aplicar ANTES de deployar backend
```
Crea `drive_connections` + altera `report_exports` para agregar `destination`, `drive_file_id`, `drive_url`.

### Archivos principales
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
- `GET /api/drive/status`
- `GET /api/drive/auth-url`
- `GET /api/drive/callback` ← no requiere auth (redirect OAuth)
- `DELETE /api/drive/disconnect`

#### Bot / vínculo Telegram
- `GET /api/bot/connection`
- `POST /api/bot/connection/link-token`

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

### setMyCommands
- Retry automático: 3 intentos, 2s entre intentos, log explícito en éxito/fallo

### Modelo actual del bot
- no opera globalmente
- cada chat debe vincularse desde dashboard con token temporal (one-shot: se invalida al vincular)
- el usuario usa deep link o `/start <token>`
- el bot resuelve identidad y filtra por ownership/scope
- token de link: expira en 30 min, verificado en el resolver

### Pendiente fuerte
Cerrar de punta a punta la experiencia multiusuario compartida del bot.

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

### `drive_oauth_phase.sql` — qué hace
- Crea tabla `drive_connections` (`owner_user_id`, `dashboard_id`, `refresh_token_enc`, unique idx)
- Altera `report_exports` agregando `destination text check('local','drive')`, `drive_file_id`, `drive_url`

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
- proyecto Firebase: `balancediario` — verificar con `firebase use balancediario` antes de deploy

### Backend
- Cloud Run / Node runtime
- proyecto GCP: `caja-chica-bot`
- contenedor: `Dockerfile` copia `server.ts` + `src/`
- imagen: `gcr.io/caja-chica-bot/boteado-bot`
- servicio Cloud Run: `boteado-bot` región `us-west2`

### Checklist antes de deployar (post-sprints)
1. Aplicar `drive_oauth_phase.sql` en Supabase prod
2. Agregar nuevas env vars al Cloud Run (ver sección 16)
3. `npm run build` → `firebase deploy --only hosting`
4. Cloud Run build + deploy

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

### Google Drive ← **nuevas, requeridas para Drive**
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI` ← debe ser `https://boteado-bot-.../api/drive/callback`
- `TOKEN_ENCRYPTION_KEY` ← base64 de 32 bytes: `openssl rand -base64 32`

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
- `npm test` → **63/63 OK**
- `npm run lint` → **OK**

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
8. solo `owner` puede conectar Drive y subir informes — `viewer` no puede
9. tokens OAuth cifrados con AES-256-CBC stdlib, sin deps externos
10. año en informes implementado como rango `YYYY-01-01 / YYYY-12-31` (no type nativo)
11. presupuesto: UI oculta con `{false && ...}`, datos y API intactos
12. **no existe fallback legacy en `getScopeEntityById`** — eliminado 2026-05-03

### Implicancia práctica
Si retomás colaboración compartida o Telegram multiusuario:
- NO arrancar por UI primero
- arrancar por schema + backend + permisos + resolución de identidad

---

## 20. Próximos pasos recomendados

### Prioridad inmediata (deploy pendiente)
1. Aplicar `drive_oauth_phase.sql` en Supabase prod
2. Agregar env vars de Drive al Cloud Run
3. Deploy frontend + backend

### Prioridad media
4. limpiar env names viejos `VITE_*` en backend/server
5. tipado correcto de `session` en Express (`(req as any).session` → tipo propio)
6. N+1 en `listDashboardMembers` → join en query
7. `syncPendingDashboardInvitations` → cachear en session en lugar de cada request

### Prioridad arquitectónica fuerte
8. terminar modelo compartido completo para Telegram multiusuario sobre `dashboard_id`

---

## 21. Archivos clave para abrir primero

- `/Users/damian/Dev/Boteado/CLAUDE.md`
- `/Users/damian/Dev/Boteado/src/DashboardApp.tsx`
- `/Users/damian/Dev/Boteado/src/server/app.ts`
- `/Users/damian/Dev/Boteado/src/server/drive.ts`
- `/Users/damian/Dev/Boteado/src/server/errors.ts`
- `/Users/damian/Dev/Boteado/src/server/gemini.ts`
- `/Users/damian/Dev/Boteado/src/server/reportExports.ts`
- `/Users/damian/Dev/Boteado/src/reports/shared.ts`
- `/Users/damian/Dev/Boteado/src/services/api.ts`
- `/Users/damian/Dev/Boteado/server.ts`
- `/Users/damian/Dev/Boteado/tests/api.test.ts`

---

## 22. Prompt correcto para retomar

> Leé `/Users/damian/Dev/Boteado/CLAUDE.md` y seguí desde el deploy pendiente: primero aplicar `drive_oauth_phase.sql` en Supabase, agregar env vars de Drive al Cloud Run, luego build y deploy frontend + backend.

O, si el foco es colaboración:

> Leé `/Users/damian/Dev/Boteado/CLAUDE.md` y seguí desde el modelo Telegram multiusuario compartido sobre `dashboard_id`.
