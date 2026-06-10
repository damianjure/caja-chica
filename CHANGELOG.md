# CHANGELOG — Caja Chica

> Registro histórico de cambios. NO se autocarga en sesiones de Claude — consultar on-demand.
> Para el estado actual y reglas operativas ver `CLAUDE.md`. Para deploy/infra ver `RUNBOOK.md`.

---

### Cambios 2026-06-10 (Agente LLM de consultas, resúmenes de tarjeta, hardening y deuda técnica)

**Agente LLM de consultas (`/api/ask` web + `/preguntar` Telegram).** Loop tool-calling JSON sobre los movimientos + recurrentes del scope del caller — los números los calculan tools en memoria, nunca el LLM (`src/server/askAgent.ts`).
- Tools: `get_saldos`, `get_top_categorias`, `get_movimientos`, `get_resumen_mensual`, `get_recurrentes`, `calcular`.
- `buscar`: filtro de texto libre sobre descripción+categoría+empresa con stemming singular/plural. Arregla el falso cero cuando el ítem vive en la descripción (ej "caramelos" cuya categoría real es "golosinas").
- `calcular`: porcentaje/diferencia/ratio/promedio determinístico (guard división por cero); el modelo copia los números obtenidos por otra tool, no calcula de cabeza.
- `get_recurrentes`: pagos recurrentes activos con próximo pago vía `computeNextRun`; arg `dias` = ventana de vencimiento.
- Sinónimos: el prompt reintenta `buscar` con sinónimos rioplatenses (combustible↔nafta…) antes de afirmar que no hay nada.
- Privacidad: `redactInternalDetails()` borra determinísticamente cualquier respuesta que filtre nombres de tools (`get_*`) — flash-lite a veces ignora la regla del prompt.
- Web: `AskChat` — chat flotante (FAB + panel) en `DashboardApp`, multi-turno (history en el cliente). Contraste: variante sutil en desktop, overlay + borde mint + header diferenciado en mobile.
- Telegram: `/preguntar` + intent `consultar` por voz/texto (single-turn).

**Resúmenes de tarjeta/banco (statements).** `RECEIPT_ITEMS_SYSTEM_PROMPT` clasifica `document_kind` (`receipt`|`statement`); si es statement → `CREDIT_CARD_SUMMARY_SYSTEM_PROMPT` → cada transacción entra al flujo batch del bot. Maneja cuotas/impuestos/devoluciones; conserva la fecha real en `created_at`. Discoverability: copy del modal web ("PDF, ticket o resumen de tarjeta") + welcome/menu de Telegram.

**Fallback `GEMINI_API_KEY_2` en flujos media.** `withMediaKeyFallback` re-descarga y re-sube el archivo con la key 2 en 429/503 (fotos, PDF, statements, álbumes, audio, `/api/extract-image`) — antes solo el texto tenía fallback.

**PRs cerrados.**
- #40 (Sentinel): respuestas 500 sanitizadas (`internal_error` en vez de `error.message` crudo de Supabase) en `me.ts`/`dashboard.ts`.
- #41 (Bolt): agregaciones de `DashboardApp` memoizadas con `useMemo`.
- #38: cerrado sin mergear (plan obsoleto — la Fase 2 web ya se shippeó con otro diseño).

**Deuda técnica.**
- Deps de frontend (vite, react, react-dom, lucide-react, sonner, @tanstack/react-query, @vitejs/plugin-react, @tailwindcss/vite) movidas a `devDependencies` → imagen Cloud Run más chica (el backend no las importa en runtime, verificado con `npm ci --omit=dev`).
- Workflow `deploy.yml` a Node 24.

**Limpieza de datos.** Soft delete de registros de prueba (movimiento USD $3M "caramelos", recurrente de $1).

---

### Cambios 2026-06-08 (Web: selección interactiva de ítems de ticket — Fase 2 + PDF)

**Portada la selección de renglones del bot (Fase 1) al dashboard web, ahora también con PDF.** La web ya recibía fotos (`/api/extract-image` → 1 movimiento); ahora extrae cada renglón y deja tildar cuáles guardar, igual que el bot.

- **`src/server/imageExtract.ts`**: nuevo `extractItemsFromBuffer()` — espejo de `extractReceiptWithItems` (bot) pero desde Buffer; usa `RECEIPT_ITEMS_SYSTEM_PROMPT` + `parseReceiptItemsResult`, con fallback HANDWRITTEN → shape de movimiento único (`items: []`). Se agregó `application/pdf` a `WEB_IMAGE_MIME_ALLOWLIST` (Gemini Files API maneja PDF como imagen).
- **`src/server/routes/imageExtract.ts`**: swap a `extractItemsFromBuffer`; el endpoint ahora devuelve `ReceiptItemsResult` + `sourceType` (antes: shape de movimiento único). El cliente decide por cantidad de ítems.
- **Bug arreglado**: `CargaModal` ofrecía PDF en el file picker pero el endpoint lo rechazaba (`unsupported_mime_type`). Ahora PDF de tickets/facturas entra por el mismo flujo.
- **`src/dashboard/lineItems.ts`** (nuevo): `buildLineItemMovements` (Separados/Sumados, filtro payable, abs montos) + `toSingleReview` (mapea <2 ítems a movimiento único). Lógica pura, espejo de `insertLineItemMovements`/`showReceiptReview` del bot.
- **`src/components/dashboard/ImageItemsReviewModal.tsx`** (nuevo): checkboxes, tildar/destildar todos, contador + total, botones **Separados** (un movimiento por ítem) y **Sumados** (uno con el total).
- **`src/DashboardApp.tsx`**: branch — si `items.length >= 2` → modal de selección; si no → `toSingleReview` → `ImageReviewModal` actual. `handleSaveLineItems` persiste vía `api.saveMovimientos`.
- **`src/services/api.ts` / `useImageExtract.ts`**: tipos `ImageLineItem` + `ImageItemsExtractionResult`; allowlist web suma PDF; mensajes "imagen o PDF".
- Tests: `tests/lineItems.test.ts` (7 casos puros) + `tests/imageExtract.test.ts` ampliado (PDF aceptado, shape de ítems, `extractItemsFromBuffer` con fallback). Suite total 831 pass.
- **Decisión de scope**: un solo endpoint que decide por cantidad de ítems (igual que el bot). PDFs de **resúmenes de tarjeta/banco** = Fase 3 separada — el prompt `CREDIT_CARD_SUMMARY_SYSTEM_PROMPT` + `parseCreditCardSummaryResult` ya existen en `gemini.ts` pero están **sin cablear** (código dormido, 0 consumidores).
- `extractFromBuffer` queda como helper tested pero ya no lo usa el endpoint (lo reemplazó `extractItemsFromBuffer`).

**Discoverability "Cargar ticket" (web + bot).** La carga de ticket era la función estrella pero estaba enterrada (web: botón dashed secundario; bot: gesto oculto sin botón en `/menu`).
- **Web `CargaModal.tsx`**: el dropzone de foto/PDF ahora **lidera** la jerarquía (tarjeta prominente con ícono + microcopy "detecto cada renglón y elegís cuáles guardar"), el textarea pasa a "— o escribilo a mano —". Título → "Cargar ticket o movimiento". Nuevo prop `autoPick` abre el file picker directo.
- **Web `DashboardApp.tsx`**: FAB mobile suma atajo dedicado **📷 Ticket** (`goToTicket` → `autoPick`), separado de "＋ Nueva".
- **Bot `keyboards.ts`**: `buildMainKeyboard` suma **📸 Cargar ticket** arriba de todo.
- **Bot `menu.ts`**: callback `cargar_ticket` → mensaje-guía ("mandame la foto o el PDF ahora 👇"). No reemplaza el gesto directo, lo hace visible.
- Mockup before/after documentado en `docs/mockups/ticket-upload-ux.html`.

---

### Cambios 2026-06-08 (Bot: selección interactiva de ítems de ticket — Fase 0+1)

**Foto de ticket → elegir qué renglones guardar.** Antes, una foto de ticket = un solo movimiento (el total). Ahora el bot extrae cada renglón y deja tildar cuáles registrar.

- **`src/server/gemini.ts`**: nuevo `RECEIPT_ITEMS_SYSTEM_PROMPT` + `parseReceiptItemsResult()` — una sola llamada a Gemini devuelve metadata del comercio (empresa, CUIT, fecha, total) + array de ítems (`descripcion`, `monto`, `cantidad`, `categoria`). Mismas validaciones/clamps que el resto (`MAX_EXTRACTION_AMOUNT`, `MAX_BULK_ITEMS`).
- **`src/server/telegramMedia.ts`**: `extractReceiptWithItems()` — espejo de `extractFromPhoto` (mismo upload/cleanup); fallback a `HANDWRITTEN` cuando el ticket es ilegible (confidence < 0.5), devolviendo shape de movimiento único (`items: []`). Mantiene el perfil de una sola llamada en el caso común.
- **`src/server/lineItemsReview.ts`** (nuevo): estado en memoria (Map + sweep 5 min con `unref`, TTL 10 min — single-instance invariant), tarjeta con checkboxes y teclados inline. Metadata del ticket se aplica a TODOS los ítems.
- **`src/bot/extraction.ts`**: las 3 entradas de foto/doc/álbum-de-1 ahora usan `extractReceiptWithItems`. Si el ticket tiene ≥2 renglones → tarjeta de selección (`li:*`); si no → flujo de revisión actual intacto. Al confirmar pregunta **Separados** (un movimiento por ítem) o **Sumados** (un único movimiento con el total). Callbacks `li:t` (toggle), `li:all`, `li:save`, `li:g:<id>:<s|u>`, `li:cancel`.
- **`src/bot/sessions.ts`**: `initSessions()` arranca también `startLineItemsSweep()`.
- Tests: `tests/lineItemsReview.test.ts` (17 casos — parser + estado + rendering).
- ✔ Fase 2 (web) completada — ver entrada de arriba.

---

### Cambios 2026-06-08 (CI/CD vía GitHub Actions + fix blank-screen prod)

**Pipeline de deploy automático.** El repo no tenía NINGÚN secret de GitHub seteado → todo push a `main` fallaba ambos jobs de deploy (auth errors), generando emails de fallo de GCP. Migrado a un pipeline funcional con Workload Identity Federation.

- **WIF en vez de SA JSON keys**: la org policy `constraints/iam.disableServiceAccountKeyCreation` bloquea crear keys → `credentials_json` y `FIREBASE_TOKEN` (deprecado) descartados. SA dedicado `github-deployer@caja-chica-bot.iam.gserviceaccount.com`, pool `github-actions-pool`, provider OIDC `github-provider` limitado al repo `damianjure/caja-chica`.
- Roles del SA: `cloudbuild.builds.editor`, `run.admin`, `storage.admin`, `iam.serviceAccountUser`, `firebasehosting.admin`, `logging.viewer`, `artifactregistry.writer`.
- **Backend**: reemplazado `gcloud builds submit` (Cloud Build) por `docker build` + `docker push` en el runner. Motivo: Cloud Build fallaba en el log streaming y el flag `--no-logstreaming` no existe en esa versión de gcloud. `gcr.io` ahora respaldado por Artifact Registry → requirió `artifactregistry.writer`.
- Ambos jobs con `permissions: id-token: write`.
- `.github/workflows/deploy.yml` reescrito. Commits: `152d8a1`, `c5f584a`, `1e8d7af`, `c175f4d`.

**Fix blank-screen en prod (misma causa: secrets faltantes).** Los 3 `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) nunca se setearon → el frontend buildeaba con env vacío → `src/services/supabase.ts` exporta `supabase = null` → los consumidores llaman `supabase.auth.*` sobre null → toda la app React crashea en blanco (sin error boundary). Confirmado curleando el bundle de prod (sin URL de Supabase embebida). Seteados los 3 secrets desde `.env.local` y redeployado; bundle nuevo embebe `https://dezgusgxotihxkfkxico.supabase.co`. **No era el código del PR #36.**

**PR #36 mergeado y deployado**: gráficos del Resumen legibles en mobile (variantes `md:hidden`/`hidden md:block`, desktop intacto) + pills de empresa compactas/ordenadas. Charts SVG en mobile: `AreaTrendChart` agrega tarjetas con números grandes (últimos 2 meses + saldo); `WaterfallChart` pasa a barras horizontales tipo lista. Ver DESIGN.md.

**Limpieza**: borrado el secret muerto `GCP_SA_KEY` (vacío, ya no usado bajo WIF).

**Pendiente**: rotar la anon key de Supabase; actualizar las actions a Node 24 antes de sept-2026.

---

### Estado deploy (2026-05-26 — sesión extendida)
- Frontend ✔ deployado en `caja-chica-bot.web.app` (último deploy: UI audit round 3)
- Backend ✔ deployado en Cloud Run rev `caja-chica-00045-dpj` (crons-to-cloud-scheduler + `min-instances=0`)
- Tests: 345 total / 343 pass / 2 skip / 0 fail
- Branch: `refactor/crons-to-cloud-scheduler` (commit `cbb6db1`) — PR pendiente de crear

### Cambios 2026-05-26 (crons-to-cloud-scheduler — SDD completo + deploy)

Migración de los 4 crons in-process (`node-cron`) a endpoints HTTP gatillados por Cloud Scheduler. Habilita Cloud Run `min-instances=0`. **Ahorro estimado: ~$58/mes** (Cloud Run idle vCPU pasa de ~$61 a ~$3).

SDD `crons-to-cloud-scheduler` archivado (engram #639–#646: explore → propose → spec → design → tasks → apply → verify → archive).

**Código (commit `cbb6db1`):**
- `src/server/cronJobs/reminders.ts` (nuevo) — `runDailyReminders({ supabase, bot })` extraído desde `server.ts:58-92`
- `src/server/cronJobs/recurrentes.ts` (nuevo) — `runRecurrentes({ supabase, bot })` extraído desde `server.ts:95-149`
- `src/server/routes/crons.ts` (nuevo) — `createCronsRouter` + middleware `requireCronSecret` con `crypto.timingSafeEqual` y fail-closed
- `src/server/app.ts` — `cronSecret?: string` agregado a `AppDeps`, router montado en `/api/crons`
- `server.ts` — `cron.schedule()` × 4 + `import cron from "node-cron"` eliminados
- `package.json` — `node-cron` + `@types/node-cron` desinstalados
- Tests: +22 (343 pass / 2 skip / 0 fail). Cobertura: middleware (timing-safe, length pre-check, fail-closed cuando `CRON_SECRET` ausente), bot null guard, 4 endpoints OK, 500 en exception
- CLAUDE.md secciones 10/12/16 actualizadas

**Infra (deployada):**
- Cloud Run rev `caja-chica-00045-dpj` con env var `CRON_SECRET` + `min-instances=0`
- Service account `cron-invoker@caja-chica-bot.iam.gserviceaccount.com` con `roles/run.invoker`
- 4 Cloud Scheduler jobs (us-west2, todos ENABLED):
  - `crons-reminders` schedule `* * * * *` → `POST /api/crons/reminders`
  - `crons-maintenance` schedule `* * * * *` → `POST /api/crons/maintenance`
  - `crons-recurrentes` schedule `0 8 * * *` → `POST /api/crons/recurrentes`
  - `crons-invite-reminders` schedule `0 10 * * *` → `POST /api/crons/invite-reminders`
- Header `X-Cron-Secret` en cada job + retry config default Cloud Scheduler
- API `cloudscheduler.googleapis.com` habilitada
- API `secretmanager.googleapis.com` habilitada
- Secret backeado en Secret Manager: `caja-chica-cron-secret v1` (recovery)

**Smoke test prod:**
- `POST /api/crons/maintenance` sin header → `401` ✔
- `POST /api/crons/maintenance` con secret incorrecto → `401` ✔
- `POST /api/crons/maintenance` con secret correcto → `{"ok":true}` ✔
- `POST /api/crons/reminders` con secret correcto → `{"ok":true,"sent":0}` ✔
- `POST /api/crons/recurrentes` con secret correcto → `{"ok":true,"processed":0}` ✔
- `POST /api/crons/invite-reminders` con secret correcto → `{"ok":true,"sent":0}` ✔
- Force-run de los 4 jobs vía Cloud Scheduler → todos sin errores ✔

**Rotación CRON_SECRET:**
1. Generar nuevo: `openssl rand -base64 32`
2. `gcloud run services update caja-chica --update-env-vars CRON_SECRET=<nuevo> --region us-west2`
3. Para cada job: `gcloud scheduler jobs update http <job> --location=us-west2 --update-headers="X-Cron-Secret=<nuevo>"`
4. Verificar con `curl -X POST -H "X-Cron-Secret: <nuevo>" <URL>/api/crons/maintenance`
5. Bumpear versión en Secret Manager: `echo -n "<nuevo>" | gcloud secrets versions add caja-chica-cron-secret --data-file=-`

**Pendiente próximas 24h:**
- Verificar logs Cloud Scheduler — confirmar `crons-recurrentes` corre 08:00 UTC y `crons-invite-reminders` corre 10:00 UTC sin errores
- Crear PR desde branch `refactor/crons-to-cloud-scheduler`

### Cambios 2026-05-18 (onboarding por invitación + modo demo — commits `df3ad5c`, `9310cf6`, `44703ad`)
- **`onboarding_demo_phase.sql`** — pendiente aplicar en prod:
  - `empresas.is_demo boolean not null default false`
  - `movimientos.is_demo boolean not null default false`
  - `app_users.onboarding_state text default 'pending' check(pending,seeded,completed,cleaned)`
  - índices parciales en `is_demo=true` para bulk-delete rápido
- **`src/server/demoSeed.ts`** — nuevo:
  - `ensurePersonalDashboard(supabase, session)` — bootstrap `dashboards` + `dashboard_members owner` para cuentas nuevas (resuelve dashboard_id NOT NULL post-cutover)
  - `seedDemoData(supabase, session, dashboardId)` — Empresa Demo SA + 10 movimientos ARS is_demo:true
  - `purgeDemoData(supabase, session, dashboardId)` — bulk-delete is_demo=true, set state=cleaned
- **Backend `app.ts`**:
  - `ensureOnboardingSeed` hook en `requireSession` — corre una vez por proceso para cuentas member con state=pending
  - `GET /api/me` — retorna `onboarding_state`
  - `PATCH /api/me` — acepta `onboarding_state` (solo completed|cleaned, no pending/seeded)
  - `DELETE /api/me/demo-data` — nuevo endpoint, purga is_demo del dashboard del caller
  - `POST /api/admin/invitations` — TTL 7 días en `expires_at` + 409 guard para duplicados activos
  - `POST /api/dashboard/invitations` — auto-purge demo al primer invite (cuando state=seeded)
- **Frontend**:
  - `WelcomeWizard.tsx` — modal 3 pasos: bienvenida → tour demo → Telegram opcional (skippeable)
  - `DashboardApp.tsx` — monta wizard cuando `onboarding_state in (pending, seeded)`
  - `ConfiguracionTab.tsx` — botón "Limpiar datos de ejemplo" visible cuando state=seeded/pending
  - `api.ts` — `OnboardingState` type, `deleteDemoData()`, `onboarding_state` en `AppViewer`
- **Tests**: stub con `.gt()`, fix shape `/api/me`. 154 pass / 2 skip / 0 fail

### Arquitectura onboarding — notas clave
- `app_role` enum = `(superadmin,admin,member)` — NO existe `owner`. "Owner" = legacy self-scope (sin dashboard_members row).
- Nuevos usuarios invitados como `member` operan self-scoped; se vuelven owner de dashboard al invitar editor/viewer.
- `dashboard_id NOT NULL` post-cutover → `ensurePersonalDashboard` crea el dashboard ANTES del seed.
- Seed punto de entrada: `requireSession` en backend (no en auth trigger ni en frontend).

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

### Cambios 2026-05-12 (ConfiguracionTab reorder + OAuth fix)
- **ConfiguracionTab** — orden de secciones ajustado: **1. Preferencias → 2. Miembros → 3. Cuenta**
- **OAuth troubleshooting**: `redirect_uri_mismatch` resuelto. Credenciales OAuth en proyecto GCP `caja-chica-bot` (no `balancediario`). `balancediario` restaurado con `gcloud projects undelete` pero no se usa activamente.
- **Nuevo owner**: primer login entra con todo vacío y en cero — ya garantizado por el scoping de datos (`dashboard_id` o `owner_user_id` del caller). Sin datos compartidos entre owners distintos.

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
- **A11y (Chunk 3)**: `text-neutral-400` → `text-neutral-500` en 11 archivos, aria-labels en icon-only buttons, aria-live en regiones dinámicas
- **Tests**: 9 nuevos (total 154 pass / 2 skip / 0 fail)

### Cambios 2026-05-20 (Brevo + impeccable polish + onboarding live)
- **`onboarding_demo_phase.sql`** ✔ aplicada en Supabase prod 2026-05-20 vía MCP supabase. Verificado vía `information_schema`: 3 columnas + 2 índices parciales.
- **Email delivery: Resend → Brevo** (commit `71f9ed4`):
  - `src/server/email.ts` reescrito con `fetch` directo a `POST https://api.brevo.com/v3/smtp/email`
  - Dep `resend` removida de `package.json`
  - Env vars nuevas: `BREVO_API_KEY`, `FROM_EMAIL` (default `hola@damianjure.com`), `FROM_NAME` (default `Caja Chica`)
  - Graceful fallback si `BREVO_API_KEY` ausente (warn + return sin throw)
  - Sender verificado en Brevo: `Damian Jure <hola@damianjure.com>`
- **Impeccable audit fixes** (commit `71805b5`):
  - `index.html`: preconnect + preload Inter en `<head>` (paralelo a JS); removido `@import` bloqueante del CSS
  - `src/index.css` `@theme`: tokens `--ease-out-quart/quint/expo`, `--duration-instant/quick/base/slow`
  - `@layer base`: default global `transition-timing-function: ease-out-quart` + `duration: 180ms` en `*`
  - `::selection` y `:focus-visible` tinted con `color-mix(in srgb, --app-text-1...)`
  - `text-rendering: optimizeLegibility` + `-webkit-font-smoothing: antialiased`
- **Impeccable polish + spacing rhythm** (commit `f2972c1`):
  - `ModalShell.tsx`: backdrop tinteado (mix `--app-text-1` 42%) + `backdrop-blur-[2px]`; botón close `h-11 w-11` (44px touch target WCAG)
  - `PlaceholderPanel`: border más suave, padding asimétrico `px-5 py-4`, `leading-relaxed`
  - `SectionCard`: header `<header mb-6>` + body `space-y-5`, `max-w-prose` description, heading `tracking-tight`, padding `px-6 py-7 md:px-8 md:py-9`
  - `MetricCard`: padding `px-5 py-4`, label `mb-2`, valor con `tracking-tight tabular-nums`
  - `index.css` `@theme`: tokens semánticos `--space-tight/snug/comfort/relaxed/section/hero`
  - `@layer utilities`: stacks `.stack-tight/.stack-snug/.stack-comfort/.stack-relaxed/.stack-section/.stack-hero` + densidades fila `.row-compact/.row-comfort/.row-airy`
- **SDD artifacts archived** (commit `77ffbef`): `openspec/` + `docs/specs/sdd-init.md` committed; `.gitignore` extendido (`.firebase/`, `.claire/`, `.claude/worktrees/`)
- **Deploys 2026-05-20**:
  - Backend Cloud Run revision `caja-chica-00012-xxv` (Brevo + env vars `BREVO_API_KEY` + `FROM_EMAIL` + `FROM_NAME`)
  - Frontend Firebase Hosting deployado 3× (post-onboarding, post-audit, post-polish)
- **Tests**: 156 total / 154 pass / 2 skip / 0 fail (verificado post-refactor Brevo)
- **AGENTS.md**: detectado desactualizado (snapshot 2026-05-07). Mantener CLAUDE.md como única fuente de verdad. AGENTS.md deprecado.

### Cambios 2026-05-21 (invitaciones unificadas — SDD completo + deploy)
SDD planning + 4 slices apply + verify + archive. Archive: `openspec/changes/archive/2026-05-21-invitaciones-unificadas/`. Engram observations #511-#519.

- **`unified_invitations_phase.sql`** — ✔ aplicada en prod 2026-05-21 vía MCP supabase:
  - `user_invitations.last_reminder_at timestamptz null`
  - `dashboard_invitations.last_reminder_at timestamptz null`, `telegram_preauth boolean default false`, `telegram_invite_token_id uuid references telegram_invite_tokens(id) on delete set null`
  - `telegram_invite_tokens.pre_authorized boolean default false`
  - Índices parciales: `idx_user_invitations_reminder`, `idx_dashboard_invitations_reminder` (where status='pending')
- **Nuevos endpoints** (`src/server/app.ts`):
  - `GET /api/personas` — vista unificada de invitaciones (user + dashboard), merge JS, filtros opcionales
  - `POST /api/personas/:id/resend` — reenvío con rate limit (3 por invite/24h), regenera token si vencido
  - `PATCH /api/personas/:id/role` — cambio de rol con matriz de transiciones
  - `POST /api/dashboard/invitations` — extendido con `telegram_preauth`: crea `telegram_invite_tokens` con `pre_authorized=true` + TTL 24h
  - `GET /api/me` — retorna `is_dashboard_joiner` derivado
- **`src/server/inviteReminders.ts`** — nuevo módulo exportable `processInviteReminders(supabase, opts?)`:
  - queries `user_invitations` y `dashboard_invitations` status=pending, created_at < now-3d, expires_at > now, last_reminder_at IS NULL or < now-1d
  - for-of con try/catch — un error no rompe los demás; log count final
  - cron `0 10 * * *` montado en `server.ts`
- **`src/components/PersonasPanel.tsx`** — nuevo componente unificado:
  - props: `scope: 'app' | 'dashboard'`, `showTelegramToggle`
  - tabla con badge status (pending/active/expired/revoked), badge role, last_action relativo
  - dropdown acciones: Resend, Copy link, Cambiar rol, Revocar
  - form de invitación con toggle telegram_preauth (scope=dashboard)
  - consume `listPersonas()`, `resendInvitation()`, `updatePersonaRole()` de api.ts
- **`src/components/WelcomeJoined.tsx`** — nuevo wizard 2 pasos para joiners invitados (sin demo seed)
- **`src/DashboardApp.tsx`** — renderiza `WelcomeJoined` para joiners, `WelcomeWizard` para owners
- **`src/server/email.ts`** — `sendDashboardInvitationEmail` acepta `telegramDeepLink?` opcional
- **`src/server/validation.ts`** — `DashboardInvitationRequest.telegram_preauth` opcional boolean
- **`server.ts`** — `handleTelegramInviteToken`: soporte `pre_authorized=true` (orphan guard + bypass `pending_owner_confirm`)
- **ConfiguracionTab.tsx** — sección Miembros usa `<PersonasPanel scope="dashboard" showTelegramToggle />`; duplicado de form invitación y lista pendiente removidos
- **Email rediseño** (`src/server/email.ts`):
  - OKLCH neutrals tinted (h≈95), accent jade `oklch(62% 0.14 148)` solo en monogram/eyebrow/badge — rompe reflex fintech navy/gold
  - Monogram + wordmark en lugar de slab negro pesado
  - Jerarquía tipográfica ratio ≥2 (eyebrow 12 → title 26 → lede 16 → body 15), tracking negativo en títulos
  - Preheader hidden para Gmail/Apple Mail preview
  - Pasos numerados con counter() CSS + cuadrito redondeado (sin caja externa)
  - Dark mode nativo vía `prefers-color-scheme`
  - Media query <480px para mobile (CTA full-width)
  - Copy sin em dashes; lede con ejemplo concreto ("pagué 4500 de luz"); firma personal en app invitation
  - Sin glassmorphism, gradient text, cards anidadas, side-stripe
  - `appInvitationHtml` y `dashboardInvitationHtml` ahora exported para preview/tests
  - `sendDashboardInvitationEmail` acepta `telegramDeepLink?` para embed de deep link
- **SDD architecture decision: Approach C aditivo** — no se toca trigger `on_auth_user_created`. Endpoints viejos (`POST /api/admin/invitations`, `POST /api/dashboard/invitations`) siguen funcionando.
- **Tests**: 208 total / 206 pass / 2 skip / 0 fail (+52 nuevos: 34 personas, 8 inviteReminder, 8 telegramPreAuth + asserts api.test.ts)
- **Verify warnings residuales**:
  - W1: `CollaborationPanel.tsx` quedó dead code (no imports) — pendiente decisión borrar
  - W2: `WelcomeJoined.tsx` sin unit tests (consistente con resto del proyecto)

### Deploy 2026-05-21
- SQL prod: ✔ aplicada vía MCP supabase
- Backend Cloud Run: ✔ revision `caja-chica-00022-s9f` (post key rotation 2026-05-22)
- Frontend Firebase Hosting: ✔ deployado en `caja-chica-bot.web.app`

### Cambios 2026-05-21 segunda tanda
- **Vocabulario unificado** (commit `303eac8`): Operador/Usuario/Dueño/Puede editar/Puede ver, sección "Equipo". `src/services/labels.ts` centralizado. Aplicado en PersonasPanel, AdminPanel, ConfiguracionTab, WelcomeJoined, LoginScreen, email.ts, bot replies, DashboardApp tab nav.
- **Badge contrast dark mode** (commit `0daec9d`): status + dashboard role + app role badges con ring + dark variants (bg-{color}-500/15 + text-{color}-200 + ring-{color}-400/40).
- **Joiner wizard fix** (commit `d10fe8f`, rev `caja-chica-00015-zck`): backend dejaba `onboarding_state='completed'` directo → WelcomeJoined nunca renderizaba. Fixed: joiners stay `pending` hasta que cierran wizard.
- **activeTab state leak** (commit `0349605`): localStorage no se limpiaba en signOut; useEffect normaliza tab contra allowed tabs del viewer actual.
- **Email v2 1-CTA** (commit `0349605`): founder voice, sin feature dump, sin nested step boxes. "Damián te sumó al dashboard" subject. Telegram pre-auth = aside line. New CSS classes (.from, .from-footer, h1.title, .fine, .aside, .link) + dark mode variants.
- **Recurrentes web UI + frecuencias** (commit `2a6d347`+`3993892`, SDD `recurrentes-ui-y-frecuencias` archive engram #524-#529): tab nueva "Recurrentes" entre Ingresos y Empresas. Full CRUD + pausar/activar + soft delete + next_run derivado con label relativo. Quincenal + anual sumadas. Migration `recurrentes_ui_phase.sql` aplicada (is_active default true + deleted_at + idx_recurrentes_active partial). DB check `recurrentes_frecuencia_check` extendida a 5 valores. Tipo 'gasto' → 'egreso' (DB compat, UI label "Gasto"). 5 endpoints `/api/recurrentes/*`. Cron `0 8 * * *` guard is_active/deleted_at + addMonth date arithmetic. Bot inline keyboard 5 botones. Tests 243/241 pass.
- **Audit follow-ups** (commit `e4066a9`): Inter Variable self-hosted (woff2 en `/public/fonts/`, removed Google Fonts CDN), radius scale tokens (--radius-xs..3xl), type scale ratio ≥1.25 (--text-xs..5xl), stack-relaxed aplicado en InformesTab + ConfiguracionTab.
- **Brevo live send test**: ✔ verificado (messageId `<202605212120.80852709198@smtp-relay.mailin.fr>`).
- **Smoke test Personas DB-level**: ✔ verificado vía supabase MCP (insert dashboard_invitations dummy → query merge JS → resend update last_reminder_at → role-edit → cleanup).

### Cambios 2026-05-24 (C4: @tanstack/react-query adoption)
- **`@tanstack/react-query` v5** instalado como dep de producción.
- **`src/main.tsx`**: `QueryClientProvider` wrappea `<App />` con `staleTime: 30s`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false`.
- **`src/hooks/dashboard/useDashboardData.ts`** migrado completamente:
  - `dashboardAccess` → `useQuery(['dashboardMembers'])`
  - `budgets` → `useQuery(['presupuestos', budgetPeriod])` — se re-fetcha automáticamente al cambiar período
  - `customCompanies` → `useQuery(['empresas'])`
  - `categories` → `useQuery(['categorias'])`
  - `history` → `useInfiniteQuery(['movimientos'])` con `getNextPageParam` → `nextCursor`; pages aplanadas via `flatMap`
  - Canal Supabase realtime ahora muta cache via `queryClient.setQueryData` en lugar de `useState` setters
  - `loadData(append)` = `append ? fetchNextPage() : refetch()`; `loadCollaboration()` = `refetch()`; `loadBudgets(period)` = `setBudgetPeriod(period)`
  - Interface pública ya NO expone `setHistory`, `setCustomCompanies`, `setBudgets`, `setDashboardAccess`, `nextCursorRef`, `setIsLoadingBudget`
- **`src/DashboardApp.tsx`** call sites migrados:
  - Helpers `prependMovements`, `removeMovement`, `patchMovement`, `patchMovementsByCompany`, `appendEmpresa`, `removeEmpresa`, `patchEmpresa` vía `useQueryClient`
  - `saveBudget` usa `queryClient.setQueryData(['presupuestos', period], ...)`
  - `deleteItem`, `deleteCompany`, `saveMovementEdit`, `saveCompanyEdit`, `onCreateCompany`, `onAssignCompany` actualizados
- **Query keys**: `['movimientos']`, `['empresas']`, `['categorias']`, `['presupuestos', period]`, `['dashboardMembers']`
- **apiStatus**: gated con `enabled: !apiMissing`; derivado de `isError` y `error` de las queries
- **Tests**: 278 pass / 0 fail / 2 skip — sin cambios en tests (hook es frontend-only)
- **Build**: ✔ limpio; react-query suma ~45KB gzip al chunk principal

### Cambios 2026-05-23 (SDD god-components-refactor + audit follow-ups)
- **SDD `god-components-refactor`** ✔ archived (engram #606, archive obs #601-#606):
  - **Slice A**: `DashboardApp.tsx` 1471→384 LoC. 4 hooks bajo `src/hooks/dashboard/` (useDashboardData, useMovementsFilter, useCompanyAssignment, useComposer) + `src/types/dashboard.ts` + `MovementCards.tsx` + `DashboardModals.tsx` extraídos.
  - **Slice B**: `ConfiguracionTab.tsx` 996→103 LoC. 4 secciones bajo `src/components/dashboard/tabs/configuracion/` (PreferenciasSection, MiembrosSection, TelegramSection, CuentaSection). CuentaSection 372 LoC (W1 aceptado).
  - **Slice C**: `server.ts` 2722→201 LoC. 11 módulos bajo `src/bot/` (deps, sessions, keyboards, utils, menu, extraction, index + commands/movements|entities|reports|recurring). `movements.ts` 1041 LoC (W2 aceptado — split pendiente).
  - Tests 278 pass / 0 fail. tsc clean.
- **Audit follow-ups — todos los items Media + Baja del informe UX/UI**:
  - **A1**: Touch targets 44×44 (logout, edit/delete pills, revoke session button)
  - **A2**: aria-label en composer + EmpresasTab + PersonasPanel inputs
  - **A3**: `role="img"`+`aria-label` summary en TrendBars, `role="list"`/`role="listitem"` en HorizontalBarList
  - **A4**: ↑/↓ arrow prefix en montos ingreso/egreso (Ingresos/GastosTab + TrendBars net label)
  - **A5**: `text-neutral-400` → `text-neutral-500` en texto crítico (role label header, Ctrl+Enter hint, footer copy, MovementCards date, DashboardModals label, PreferenciasSection hs UTC, PersonasPanel secondary)
  - **B1**: "Egreso/Egresos" → "Gasto/Gastos" en UI + bot keyboards/replies (DB egreso preserved)
  - **B2**: `escapeMd()` helper aplicado en todos los replies bot con valores user-provided
  - **B3**: Botón "← Atrás" en flujos multi-step `/informes` (rb:temporalidad/alcance/tipo/format) + `/recurrente` (rec_back:tipo/moneda)
  - **B4**: Error checking en `/empresas`, `/categorias`, `/saldos`, `/buscar` (antes silent failures)
  - **B5**: `splitForTelegram(text, 3900)` chunking en `/saldos` (Telegram 4096 char limit)
  - **B6**: Paginación `/buscar` con "Mostrar más" callback `srch:offset:query` + peek-next
  - **B7**: `ctx: any` → `Context` (grammy) en utils, menu, extraction, movements, recurring, reports
  - **B8**: `replyExpiredSession()` helper con InlineKeyboard restart button (`rec_start` / `rp_start`)
  - **B9**: Confirmación borrar empresa muestra count de movimientos asociados (web + bot `/borrarempresa` + `del_emp_pick`)
  - **C5**: `React.memo` en MovementCards
  - **C7**: motion (127KB raw / 42KB gzip) **removido completamente**. Reemplazado por CSS keyframes (`anim-fade-in`, `anim-fade-in-down`, `anim-scale-in`, `anim-backdrop-in`, `anim-card-in`) + `prefers-reduced-motion` guard. Affected: DashboardApp, MovementCards, DashboardModals, ModalShell, WelcomeWizard, WelcomeJoined. `npm uninstall motion`. Vite manualChunks limpiado.
  - **D1**: Radius normalizado — containers `rounded-xl` (LoginScreen, AdminPanel, BotConnectionPanel `3xl`→`xl`; ChartCard, ModalShell, WelcomeWizard, WelcomeJoined `2xl`→`xl`).
  - **D2**: `border-neutral-100` → `border-neutral-200` sweep (12 archivos componentes).
  - **D3**: ResumenTab grid `sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5` (antes `md:grid-cols-2 xl:grid-cols-5` dejaba 5ª card sola).
  - **D4**: Chart colors → tokens semánticos `--chart-income/expense/net/baseline` (theme-aware, OKLCH), aplicado en TrendBars + HorizontalBarList + ResumenTab legend.
  - **D5**: `EmptyState` primitive (title+hint+canWrite+cta) aplicado en Resumen monthly + Ingresos recent + Gastos recent.
  - **D6**: BudgetComparisonList labels uppercase tracking-widest tabular-nums.
  - **D7**: Verificado ya implementado (LoginScreen `blocked` + `secondaryActionLabel="Salir y usar otra cuenta"`).
  - **C6**: Verificado no hay `window.location.reload()`. OAuth callback usa `replaceState` + state update.
- **Deploys 2026-05-23**:
  - Frontend `caja-chica-bot.web.app` (3 deploys: post-Slice-C, post-media, post-baja)
  - Backend Cloud Run `caja-chica-00035-rz4` (post-baja)
- **Tests**: 278 pass / 0 fail / 2 skip
- **Bundle delta C7**: motion chunk 127.97 kB / 41.97 kB gzip → 0
- **W2 split** (2026-05-23): `src/bot/commands/movements.ts` 1041 LoC → `movements.ts` ~380 LoC (helpers + bot.command registrations) + `movements-callbacks.ts` ~380 LoC (bot.callbackQuery + bot.on message/audio handlers). `src/bot/index.ts` unchanged.

### Cambios 2026-05-24 (dead code cleanup)
- **CollaborationPanel.tsx**: ya borrado previamente (verificado — no existe). Item obsoleto.
- **Presupuesto UI eliminada**: removida de `GastosTab.tsx`. Removidas también:
  - `BudgetFormState`, `budgetForm`, `setBudgetForm`, `saveBudget`, `budgetVsActual`, `actualByCategory`, `initialBudgetPeriod` en `DashboardApp.tsx`
  - `budgets`, `budgetPeriod`, `setBudgetPeriod`, `isLoadingBudget`, `loadBudgets`, `Presupuesto` query en `useDashboardData.ts`
  - `BudgetComparisonList` componente eliminado de `Charts.tsx`
  - `readDefaultCurrency`, `PREF_CURRENCY_KEY` cleanup (siguen en `PreferenciasSection.tsx`)
  - Backend endpoints `/api/presupuestos` y tests preservados (data/API intactos)
- Tests 278 pass / 0 fail. tsc + build clean. Deploy frontend.

### Cambios 2026-05-25 (Codex review fixes + CUIT matching + label rename + tooling)
- **Codex CLI integrado** (plugin `openai-codex` 0.133.0, auth ChatGPT). Commands disponibles: `/codex:review`, `/codex:adversarial-review`, `/codex:rescue` (companion subcommand: `task`), `/codex:status`, `/codex:result`, `/codex:cancel`, `/codex:setup`.
- **Codex adversarial-review working tree** → 2 bugs reales en `ConfirmDestructive.tsx`:
  - **[high]** Escape race: handler con `[]` deps cerraba sobre `isWorking` inicial; usuario apretaba Escape mientras operación destructiva in-flight y modal se cerraba pero op seguía. Fix: refs `isWorkingRef`/`onCancelRef` sincronizados cada render.
  - **[medium]** Typed-confirm UX inconsistente: modal habilitaba botón con `.trim().toUpperCase()` pero `runConfirmation()` en `DashboardApp.tsx:302` exigía case-sensitive exact match. Fix: normalizar igual en ambos lados.
- **Codex review --base origin/main** → 1 finding P1:
  - **[P1]** React Query cache leak cross-account: `QueryClient` vive arriba de auth, keys globales (`['movimientos']`, `['empresas']`, `['categorias']`, `['dashboardMembers']`) leakaban datos del user anterior hasta 30s post-logout. Fix: `queryClient.clear()` en `handleSignOut` (App.tsx). `useQueryClient` import agregado.
- Commit `6be2ad4`: los 3 fixes + ConfirmDestructive integrado en DashboardModals + nuevo tipo en `types/dashboard.ts`.
- **CUIT matching en `resolveTelegramCompany()`** (delegado a Codex task, 3m background):
  - `src/server/telegramCompanyResolution.ts`: agrega `cuit?: string | null` a `TelegramCompanyOption`, `normalizeCuit()` (digits only, valida 11), `cuitPattern` regex (`XX-XXXXXXXX-X` o `\d{11}`), `extractCuitCandidates()`, `stripCuitCandidates()`. Resolver prioriza match por CUIT antes de fuzzy name.
  - `src/bot/commands/movements.ts`: `listTelegramCompanies()` selecciona/mapea `cuit`.
  - `tests/telegramCompanyResolution.test.ts`: +3 tests (formatted CUIT priority, 11-digit normalization, fuzzy fallback).
  - Tests 281 pass / 0 fail / 2 skip (de 278 anteriores).
  - Commit `9dbf3e1`.
- **Label rename: vocabulario UI alineado con SaaS estándar** (commit `50b20cc`):
  - **DB enums intactos** (`app_role` = `superadmin`/`admin`/`member`; `dashboard_member_role` = `owner`/`editor`/`viewer`). Cambio solo en labels visibles al usuario.
  - **Mapping completo**:

    | Tier | DB enum | Label anterior | Label nuevo | Industria |
    |---|---|---|---|---|
    | identity (sistema) | `superadmin` | Operador | **Super Admin** | Slack/Google Workspace |
    | identity (sistema) | `admin` | Admin | **Admin** *(sin cambio)* | universal |
    | identity (sistema) | `member` | Usuario | **Miembro** | Slack/Notion/Linear/GitHub |
    | resource (dashboard) | `owner` | Dueño | **Dueño** *(sin cambio)* | Notion/Stripe |
    | resource (dashboard) | `editor` | Puede editar | **Puede editar** *(sin cambio)* | Notion verb-phrase |
    | resource (dashboard) | `viewer` | Puede ver | **Puede ver** *(sin cambio)* | Notion verb-phrase |

  - **Razones del rename**:
    - "Operador" no se usa en SaaS moderno (Slack/Notion/Stripe/Vercel/GitHub usan "Owner" o "Super Admin"). Connotación de "telefonista" o "admin técnico", no de "el que manda".
    - "Usuario" es ambiguo: todos los logueados son "usuarios" en sentido literal. El rol busca decir "sin permisos elevados" → "Miembro" es más preciso y alinea con industria.
    - **Dueño / Puede editar / Puede ver mantenidos**: ya estaban alineados con Notion-style verb-phrases ("Can edit", "Can view"). Funcionan bien en español.
  - **Files tocados**:
    - `src/services/labels.ts`: `APP_ROLE_LABELS.superadmin` / `.member` + comentario del modelo actualizado.
    - `src/components/AdminPanel.tsx`: 2 hardcoded label maps (línea 343 select options, línea 703 role pill map) reemplazados por `APP_ROLE_LABELS` lookups.
  - **Impacto en DB**: cero. `app_role` enum sigue siendo `(superadmin, admin, member)`.
  - **Impacto en API**: cero. Endpoints y JSON responses siguen usando los strings DB (`superadmin`, `admin`, `member`). Solo cambia lo que UI muestra al usuario final.
  - **Impacto en lógica de permisos**: cero. `can(member, action)` y RLS policies usan enums DB, no labels.
  - **Lugares donde el usuario ve el cambio**:
    - `AdminPanel` (superadmin only): dropdown de roles al invitar, role pills en lista de usuarios.
    - `PersonasPanel` (en ConfiguracionTab): tabla de personas y form de invitación (consume `APP_ROLE_LABELS`).
    - Badge tooltips: `badgeTooltip()` helper sigue retornando hints en español de `APP_ROLE_HINTS`.
    - Email templates: NO afectados (usan rol como string técnico).
- **Inter Variable self-host** (commit `6036cb1`):
  - `public/fonts/InterVariable.woff2` (344K) bajado de rsms.me/inter
  - `src/index.css`: `@font-face` declaration con `format("woff2-variations")`
  - `index.html`: preload `<link rel="preload" as="font" .../>`
  - Eliminada dependencia Google Fonts CDN (LCP más rápido + privacidad).
- **`.trailmark/entrypoints.toml`** (commit `6036cb1`):
  - Declara taint sources: `express-api`, `telegram-bot-handlers`, `cron-jobs`, `google-oauth-callback`, `supabase-auth-hook`.
  - Habilita análisis automático de blast radius desde input no confiable.
- **Security hardening (sesión previa, commit `6bdf06e`)**:
  - `email.ts`: `sanitizeHeader()` strip CRLF en sender/recipient/subject (defense-in-depth); `AbortController` timeout 10s en fetch a Brevo.
  - `demoSeed.purgeDemoData()`: errores Supabase ahora se loguean (antes silenciados).
  - `demoSeed.ensurePersonalDashboard()`: dashboard name cap 60 chars.
  - `npm audit fix`: protobufjs CVE-DoS + ws CVE-uninitialized-memory → 0 vulnerabilidades.
- **Tooling instalado**:
  - `trailmark 0.3.1` (uv tool install). Hotspot detectado: `createApp` complexity 309 (deuda estructural, no vuln).
  - `semgrep 1.163.0` (uv tool install). 1 finding `cors-misconfiguration` en `app.ts:115` = false positive (allowlist check antes de reflect).
- **GCP `balancediario` cleanup**: ya `PROJECT_DELETE_INACTIVE`, no requiere acción (en gracia desde antes).
- **Onboarding DB programmatic check**: 4 app_users en DB (`damianjure`/`criptodiscord` cleaned/completed, `damianjuregpt`/`carlosdjure` en `pending`). 0 demo data — purge OK o nunca seeded. Próximo login de pending users dispara `ensureOnboardingSeed` y wizard.
- **`.firebase/` untrack** (commit `f6d59cc`): cache ya en `.gitignore` pero estaba tracked desde antes; `git rm --cached` cierra el ruido en `git status`.
- **Backend Cloud Run revisions**: `caja-chica-00013-wcv` (security hardening) → `caja-chica-00036-flj` (CUIT matching).
- **Frontend Firebase Hosting**: 5+ deploys hoy (post cada commit relevante).

### Cambios 2026-05-26 (UI audit dark mode fix + maintenance-mode SDD)

#### UI audit fixes (commit `d34dad6`)
- **Dark mode active tab**: `--app-strong-surface` en dark mode cambiado de `oklch(96% 0.008 155)` (blanco puro) a `oklch(76% 0.016 158)` (sage accent) — tab activo ya no aparece blanco en dark mode
- **border-neutral-900 override**: agregado a `@layer utilities` para seguir `--app-strong-surface` en dark mode
- **Mobile tab radius**: `rounded-lg` → `rounded-xl` (consistencia con desktop)
- **Alert banners radius**: `rounded-lg` → `rounded-xl`
- Score UI audit: 16/20 → 20/20
- También aplicados previamente (commit `c4dfce1`): `tabular-nums` en valores monetarios, `tracking-tight` en headings, `font-bold` en labels uppercase, `space-y-4` en SectionCard/PreferenciasSection

#### Modo Mantenimiento — SDD completo (3 PRs, commits mergeados a main)

**SQL**: `maintenance_mode_phase.sql` ✔ aplicada en prod 2026-05-26

**Arquitectura**:
- `maintenance_windows` tabla en Supabase — single-row upsert (id siempre = 1), status enum: none/scheduled/grace/active
- `src/server/maintenance.ts` — in-memory cache 30s + `isWriteBlocked()` + `hydrateCache()`
- `src/server/maintenanceNotify.ts` — fan-out Brevo + Telegram, per-user try/catch
- `src/bot/maintenance-gate.ts` — `assertBotWritable(ctx)` — retorna false y responde si activo/grace
- `src/components/MaintenanceBanner.tsx` — banner sticky, amber (active/grace) / blue (scheduled) / null (none)
- `src/components/dashboard/tabs/configuracion/MaintenanceSection.tsx` — solo visible a superadmin

**Endpoints nuevos**:
- `GET /api/maintenance/status` — público (no auth), polled cada 60s por frontend
- `POST /api/maintenance/activate` — superadmin only, inicia período de gracia 5 min
- `POST /api/maintenance/schedule` — superadmin only, programa con fecha/hora
- `POST /api/maintenance/end` — superadmin only, finaliza y notifica

**Cron** (en `server.ts`, cada minuto):
- `scheduled` → `grace` cuando `now >= scheduled_at`, envía notificación inicio
- `grace` → `active` cuando `now >= grace_ends_at`
- 30-min reminder para scheduled (dedupe via `notification_sent_30min`)

**Bot gating**: todos los handlers de escritura en movements.ts, movements-callbacks.ts, entities.ts, recurring.ts, extraction.ts llaman `assertBotWritable(ctx)` al inicio

**Tests**: 281 → 321 pass (+40 nuevos en 6 archivos de test)

**Deploy**:
- Backend Cloud Run rev `caja-chica-00040-chv`
- Frontend Firebase Hosting deployado

### Cambios 2026-05-26 (sesión extendida — security fixes + UI audit 3 rondas)

#### Security fixes Codex adversarial review (9 fixes, commits `app.ts`/`demoSeed.ts`/`maintenance.ts`/`movements.ts`/`movements-callbacks.ts`/`server.ts`)
- `DELETE /api/movimientos/last`: wrapped con `applyDataScope` (scope de ownership)
- Telegram preauth: check `tTokenErr` antes de construir `telegramDeepLink`
- Drive OAuth callback: check `upsertErr`, redirect a `driveError=save_failed`
- GDPR export `GET /api/me/export`: check `mov.error || emp.error || cat.error`, retorna 500
- `demoSeed.ts`: error logging en update `onboarding_state=seeded`
- `maintenance.ts`: fail-closed en error de Supabase (usa stale cache si existe, si no retorna `status: "none"`)
- `movements.ts`: scope `owner_user_id` para non-dashboard users en `editar_ultimo_ingreso/egreso`
- `movements-callbacks.ts`: scope en `confirm_delete_mov_` delete
- `server.ts` cron recurrentes: check `insertErr` antes de avanzar `last_processed`

#### UI audit round 1 (commit `1f6401b`)
- RecurrentesTab: delete confirm, dialog semantics, empty/loading states
- DashboardApp: tab nav ARIA (`role="tablist"`, `aria-selected`)
- MovementCards: "Copiar JSON" → "Copiar movimiento" + aria-labels
- CuentaSection: `flex-col sm:flex-row` mobile layout
- PreferenciasSection: dark mode CSS vars tokens
- InformesTab: dark mode + history `flex-wrap`
- PersonasPanel: loading text + aria-labels
- EmpresasTab: structured empty state

#### UI audit round 2 (commit `62e0eb0`)
- GastosTab + IngresosTab: unified empty states
- RecurrentesTab: modal `grid-cols-1 sm:grid-cols-2`
- MaintenanceSection: `ConfirmModal` para activate+end
- WelcomeJoined: `bg-neutral-900` (reemplaza indigo/sky gradient)
- BotConnectionPanel + TelegramSection: `rounded-md` → `rounded-xl`
- `index.css`: eliminado `@font-face` Inter duplicado
- Charts.tsx: TrendBars `grid-cols-1 sm:grid-cols-2`
- MiembrosSection: `role="switch"` + `aria-checked` + `sr-only`
- DashboardApp: composer full-width button mobile

#### UI audit round 3 (commits `39fdb95`, `d9f6165`)
- PersonasPanel ActionMenu: `aria-expanded`, `aria-haspopup="menu"`, `role="menu"/"menuitem"`, Arrow+Escape keyboard navigation. TS fix: named `KeyboardEvent` import + `HTMLElement[]` explicit type.
- WelcomeWizard + WelcomeJoined: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus-on-mount via `useRef`, Escape handler en backdrop
- MovimientosTab: `aria-pressed` en filter chips tipo/moneda, `role="group"` wrappers
- GastosTab: `aria-pressed` en filter chips empresa, `role="group"` wrapper
- DashboardApp: `role="status"` en banner `missing_url`, `role="alert"` en `load_error` + composer error

### Cambios 2026-05-27 (modal portal unification + DESIGN.md como fuente de verdad UI)

#### Portal rule (commit pendiente)
- `ConfirmModal.tsx` + `ConfirmDestructive.tsx`: agregado `createPortal(document.body)` para que el backdrop `fixed inset-0` no quede atrapado en ancestros con `transform` (tab panels con `anim-fade-in`).
- `ConfirmDestructive`: z-index unificado de `z-50` → `z-[200]` para alinear con `ModalShell` y `ConfirmModal`.
- **Regla establecida**: todo modal con backdrop `position: fixed` DEBE usar `createPortal(document.body)`. Documentado en `DESIGN.md § Modals`.

#### DESIGN.md como fuente de verdad para UI/UX
- `DESIGN.md` cargado y validado. Correcciones aplicadas:
  - Botones de acción: `rounded-xl` → `rounded-md` (DESIGN.md: buttons = 0.5rem)
  - Inputs/selects de formulario: `rounded-xl` → `rounded-md`
  - Archivos corregidos: `DashboardModals.tsx`, `InformesTab.tsx`, `MovementCards.tsx`, `RecurrentesTab.tsx`, `ModalShell.tsx` (botón X)
- **Regla**: antes de cualquier cambio de UI, leer `DESIGN.md`. Es la fuente de verdad de tokens, radios, colores y reglas de componentes.

### Cambios 2026-05-28 (Gemini fallback key + graceful degradation)

Telegram caído en prod: primary `GEMINI_API_KEY` con `429 RESOURCE_EXHAUSTED` ("prepayment credits depleted"). No era bug de código — cuota agotada. Fix: segunda key + degradación elegante.

**Arquitectura** (commit `76da710`, rev `caja-chica-00046-rp8` + env var rev `caja-chica-00047-bqv`):
- `src/server/geminiWithFallback.ts` (nuevo):
  - `GeminiUnavailableError` — error tipado cuando todas las keys agotan cuota
  - `isQuotaError(err)` — detecta `status === 429` o `message` con `RESOURCE_EXHAUSTED`
  - `geminiGenerateText(primary, fallback, args)` — intenta primary, en quota error reintenta con fallback; si fallback también agota o no existe → `GeminiUnavailableError`
- **Texto** (`/api/extract`, bot `processTelegramFinancialText`): soporta retry con segunda key vía `geminiGenerateText`
- **Media** (fotos/audio/PDF): NO reintenta con segunda key — los archivos subidos vía Files API quedan scopeados a la primary key. Solo degradan con mensaje elegante (`telegramMedia.ts`, `telegramAudio.ts`, `extraction.ts` convierten quota → `GeminiUnavailableError`)
- **HTTP**: `/api/extract` retorna `503 { error: "ai_unavailable" }` (distinto de 500 genérico). Frontend `useComposer.ts` muestra "La IA no está disponible ahora mismo" en 503 vía `ApiError.status`
- **Bot**: replies MarkdownV2 elegantes ("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)…")
- `genAI2: GoogleGenAI | null` cableado por `BotDeps` + `AppDeps`; `server.ts` instancia `genAI2` solo si `GEMINI_API_KEY_2` presente
- Groq descartado como fallback: sin soporte vision (fotos requieren Gemini)

### Cambios 2026-05-29 (sesión extendida: createApp refactor + 3 tracks UX/email/design + deploy)

Sesión grande post-review. 2 fixes + 4 cambios SDD, todo deployado a prod. Tests 343→**408 pass / 0 fail / 2 skip** (+65). tsc clean.

**Fixes previos (commits `4cead9a`, `258c6a6`):**
- `tests/personas.test.ts`: time-bomb fixtures (expires_at hardcodeado vencido) → `futureExpiry` relativo a `Date.now()`. `derivePersonaStatus` ya estaba bien.
- `src/server/geminiWithFallback.ts`: `isQuotaError` → `isGeminiCapacityError` — caza 429/RESOURCE_EXHAUSTED (quota) **Y** 503/UNAVAILABLE/"overloaded" (overload). Texto/foto/audio degradan parejo a 503 `ai_unavailable`. +14 tests.

**SDD `createapp-decomposition`** (engram #689-698, branch `refactor/createapp-decomposition`): god-function `createApp` (trailmark complexity 309) → 6 módulos nuevos en `src/server/` (`contracts.ts`, `dataScope.ts`, `audit.ts`, `botConnection.ts`, `invitations.ts`, `scopePermissions.ts`) + typed `XxxRouterDeps` por router (ISP). **`routeContext` 56-prop ELIMINADO.** createApp body ~620→~384, app.ts 779→541. Refactor PURO, cero cambio de comportamiento. Borrado dead-route `GET /api/movimientos` duplicado en `presupuestos.ts`. `SupabaseLike.from()` sigue `any` (seam de test, defer → futura SDD `supabaselike-typing`). ⚠️ trailmark 0.3.1 NO parsea TS (`nodes:0`) — número 309→24 no reproducible por tool; win estructural probado por tests + tsc.

**Track A `bot-ux-typing-and-entities`** (engram #702-707, branches `refactor/bot-ux-slice-1/2`): B1-B4 feedback — `sendTyping(ctx)` typing indicator en cold-start/Gemini (`utils.ts`), `/cancel` global (`commands/cancel.ts` + `clearChatSessions` en `sessions.ts`), cancel buttons en prompts. E1-E4 entities — `telegramCategoryResolution.ts` (fuzzy mirror de empresa, sin CUIT) + dedupe case-insensitive en `createCategoriaFromBot`/`createEmpresaFromBot` + quick-pick `categoriaOptions` en review + `er:ca:*` callbacks (disjuntos de `er:co:*`). empresa byte-idéntico.

**Track C `design-md-completeness`** (branch `docs/design-md-completeness`): DESIGN.md +78 líneas — §6 Motion (tokens ease/duration + anim-* keyframes + reduced-motion), §7 States (loading/empty/error), §8 Spacing&Density (.stack-*/.row-*), §9 Accessibility, componentes faltantes (toggle/dropdown/toasts) en §5, nota drift `.stack-*` no aplicados en ConfiguracionTab/InformesTab.

**Track B `superadmin-email-management`** (engram #709-718, 4 sub-PRs `feat/email-mgmt-pr1-s4`/`pr2a-i`/`pr2a-ii`/`pr2b`): gestión de email/invitaciones para superadmin. **Constraint Brevo**: solo senders VERIFICADOS (`GET /v3/senders`), NO free-form (crear sender = OTP manual en Brevo).
- `email_settings` (single-row) + `email_log` (append-only) — `email_management_phase.sql` ✔ aplicada prod 2026-05-29 vía MCP.
- `src/server/emailSettings.ts` (`getActiveSender` 5min cache + **env fallback**), `email.ts` refactor (`sendViaBrevo` opts + `{ok,messageId}` return + `configureEmail({supabase})` injector + emailType), `emailLog.ts` (`writeEmailLog` **fire-and-forget**), `brevoSenders.ts` (proxy verified senders 5min cache).
- 5 endpoints superadmin en `createAdminRouter`: `GET/PATCH /api/admin/email-settings`, `GET /api/admin/email-settings/senders`, `POST /api/admin/email-settings/test-send` (rate-limit `tierEmailTest` 3/día), `GET /api/admin/email-log`.
- AdminPanel: `EmailSection.tsx` (dropdown senders verificados + save + test-send) + `EmailLogView.tsx` (delivery log + filtros + triple-state) + S4 resend/filtros (reusa `/api/personas/:id/resend`).
- Invariantes: **env-fallback** (sin `email_settings` → usa env, cero cambio de comportamiento), **fire-and-forget log** (fallo de log NUNCA rompe el envío), superadmin-only ×5, same `BREVO_API_KEY`.

**Deploy 2026-05-29:**
- Backend Cloud Run rev **`caja-chica-00050-z9r`** (createApp refactor + Track A + Track B endpoints). Smoke: `/api/health` 200, `/api/admin/email-settings` 401 (gated, no 404 = código nuevo vivo).
- Frontend Firebase Hosting `caja-chica-bot.web.app` (AdminPanel con EmailSection/EmailLogView).
- Migration `email_management_phase.sql` ✔ prod Supabase `dezgusgxotihxkfkxico`.

**Pendiente post-deploy**: mergear ~8 PRs en GitHub (branches en origin); rotar keys Brevo + `GEMINI_API_KEY_2`; archive formal SDD A/B (verificados inline + por tests). Nota: el branch `refactor/createapp-decomposition` tiene su propio commit de doc 2026-05-29 que solapa con esta sección — al mergear PRs, esta sección de local main es la canónica.

### Cambios 2026-05-30 (8 features batch — SDD automático + deploy)

Sesión grande: 8 cambios cohesivos en modo SDD automático (engram artifacts, commit-por-cambio a main), strict TDD, review fresca por cambio de riesgo. Tests **408 → 572 pass / 2 skip / 0 fail**. Todo deployado.

**Cambios (commits en `main`):**
1. `904a519` **design-iconography** — §11 "Iconografía" en DESIGN.md (icono = reconocimiento, no decoración; monocromo text-3, color solo en flecha ingreso/gasto) + prop `icon?` opcional en `MetricCard`/`SectionCard` + iconos en Resumen/Gastos/Ingresos.
2. `d48aa7b` **bot-quick-actions** — (a) `↩️ Deshacer` inline tras guardar (`undo:<movId>` stateless, doble-scope + audit), (b) saldo rápido `💰 Hoy`/`📅 Semana` en mainKeyboard, (c) `setMyCommands` por rol vía `BotCommandScope` (viewer ve menos; `setScopedCommands` en owner /start + ambas ramas de `handleTelegramInviteToken`), (d) aviso de baja confianza/empresa sin resolver en la tarjeta de revisión. Nuevo `src/bot/quickActions.ts`; `buildLowConfidenceNote` canónico en `extractionReview.ts`.
3. `51d1ef3` **app-forecast-insights** — saldo proyectado 30 días con recurrentes activos (`src/dashboard/forecast.ts`, expansión por frecuencia con clamp de mes/año) + insights sobre summaries (`insights.ts`), card nueva en ResumenTab. Lógica pura TDD.
4. `de27a2a` **bot-recurrentes-mgmt** — comando `/recurrentes`: listar + pausar/reactivar (`rec_pause:`/`rec_on:`, doble-scope en el UPDATE, maintenance-gated, `requireTelegramCan(write_movimiento)`). Nuevo `src/bot/recurrentesMgmt.ts`.
5. `c8b1c9a` **app-web-receipt-upload** — composer web acepta imagen (drag-drop + cámara) → `POST /api/extract-image` (base64) reusa pipeline Gemini Vision del bot (`src/server/imageExtract.ts` `extractFromBuffer`, mismo RECEIPT→HANDWRITTEN) → `ImageReviewModal` editable → guarda vía POST /api/movimientos. **Fix seguridad (review fresca, CRITICAL)**: el `express.json()` global SKIPea `/api/extract-image`; el router parsea DESPUÉS de `requireSession → tierStrict` (guard DoS pre-auth — sin auth nunca bufferea el body). Cap 7MB decoded, mime allowlist, 503 `ai_unavailable` (media NO reintenta con 2da key, Files API scopeado a primary).
6. `dd969ff` **app-command-palette** — Cmd+K / Ctrl+K búsqueda global (movimientos/empresas/categorías) + acciones rápidas. `src/dashboard/commandSearch.ts` (ranking prefix>word>substring, accent/case-insensitive vía NFD), `src/components/CommandPalette.tsx` (portal, focus-trap, teclado, ARIA). Reusa data react-query en memoria, sin endpoint nuevo.
7. `12d4e33` **app-pwa** — installable vía `vite-plugin-pwa` (manifest + Workbox SW, `registerType: autoUpdate`). **API NUNCA cacheada** (NetworkOnly para `/api/`, `supabase.co`, `run.app` — data financiera siempre fresca). `sw.js`/`manifest.webmanifest` con `no-cache` en firebase.json; assets hasheados `immutable`. Iconos generados con PIL (funcionales; repintar = opcional).
8. `d9bbe87` **bot-inline-mode** — `@bot 4500 luz` desde cualquier chat (`src/bot/inlineMode.ts`). **Stateless** (cero Maps, re-resuelve identidad por `from.id` — refuerza, no rompe, invariant #18). Parser determinístico de slang rioplatense (luca/palo/gamba/k, sin Gemini). **Anti-tamper (review fresca, 2 HIGH)**: monto/moneda del query RE-parseado, `result_id` solo aporta `tipo` + cross-check (`resolveInlineSaveAmount` descarta si difieren); `escapeMd` en descripción; legacy owner (role=null + ownerUserId) → "owner"; cap `MAX_INLINE_AMOUNT`. Gates can(write)+maintenance en el SAVE.

**Deploy 2026-05-30:**
- Frontend Firebase Hosting `caja-chica-bot.web.app` (con PWA).
- Backend Cloud Run rev **`caja-chica-00051-2x6`** (image rebuild, env vars + min/max-instances preservadas). Smoke: `/api/health` 200, `/api/maintenance/status` 200, `POST /api/extract-image` sin auth → **401** (código nuevo vivo + auth-before-parse confirmado).
- Sin SQL nuevo. Sin env vars nuevas. Engram #722–#728. Mockups HTML en `mockups/` (iconos dashboard + flujos bot).
- Endpoints nuevos: `POST /api/extract-image`. Comando bot nuevo: `/recurrentes`. Inline mode (requiere BotFather, ver Pendiente).

### Cambios 2026-05-31 (bot voice/text intent router — deploy)

Router de intención sobre voz Y texto libre del bot: frases habladas/escritas disparan acciones del menú, no solo dictado de movimiento. **1 sola llamada a Gemini** (el prompt de extracción ahora devuelve `intent` + `confidence` + `slots`; cero call extra). Branch `feat/bot-voice-intents` (commit `2b22192`, PR pendiente de merge — gh no auth local).

**Arquitectura:**
- `src/bot/voiceIntent.ts` (puro) — enum `BotIntent`, `parseIntentResult`, `resolveIntentAction` (decisión 3-vías: execute / confirm / clarify), `INTENT_CONFIRM_THRESHOLD=0.6`, `LEGACY_INTENT_MAP` (REGISTRAR→movimiento, GESTIONAR_EMPRESA→crear_empresa, ELIMINAR_MOVIMIENTO→borrar_ultimo).
- `src/bot/intentSlots.ts` (puro) — `normalizeReportSlots`/`normalizeRecurrenteSlots`/`normalizeEditSlots` + echos. es-AR money ("10.000"→10000), gasto→egreso, dólares→USD, año→range.
- `src/server/gemini.ts` — `SYSTEM_PROMPT` reescrito (vocabulario completo + confidence + slots por intención). `parseGeminiJsonResponse` afloja (intent ausente → REGISTRAR). Regla negativa: **borrar empresa/categoría NO soportado por voz → `desconocido`**.
- `processTelegramFinancialText` (movements.ts) — top gate ahora `read` (viewers leen por voz); `ensureWritable()` re-chequea write+mantenimiento por-intent; switch a handlers existentes. Inyecta `HOY ES <fecha>` al prompt (resuelve "mayo" → `2026-MM`).
- Estado entre mensajes: **`pendingIntentConfirmSessions`** Map (TTL 5min + sweep, en `clearChatSessions`). **Single-instance invariant intacto** (#18). Slots en sesión, no en callback_data.
- Callbacks `ic:ok` / `ic:edit` (movements-callbacks.ts).

**Intents cableados:** movimiento, crear_empresa, crear_categoria, saldos, buscar, listar_empresas, listar_categorias, listar_recurrentes, abrir_dashboard, borrar_ultimo (→ confirm card, antes muerto). informe + recurrente_nuevo + editar_ultimo → **tarjeta eco [Confirmar][Editar]** (Confirmar=ejecuta vía `runReportFromSlots`/`createRecurrenteFromBot`/`applyEditLast`; Editar=flujo guiado; slots incompletos → flujo). clarify → eco + teclado del menú. borrar_empresa excluido a propósito.

**Smoke test Gemini en vivo (gate pre-deploy):** 21 frases. B1 movimientos todos `movimiento` conf 0.80–1.00 (sin falso clarify, jerga ok). 2 bugs cazados+fixeados en vivo: (1) `informe de mayo`→`mes:"YYYY-05"` → fix inyección de fecha; (2) `borrá la empresa Delta`→a veces `crear_empresa` → fix regla negativa (3/3 estable `desconocido`).

**Deploy 2026-05-31:** Backend Cloud Run rev **`caja-chica-00057-xfp`** (image rebuild, env vars + min=0/max=1 preservadas). Smoke prod: `/api/health` 200, `/api/maintenance/status` 200. Sin SQL nuevo, sin env vars nuevas. Tests 681 pass / 2 skip / 0 fail. Engram #748.

**Limitaciones conocidas:** (1) `editar_ultimo` edita el ÚLTIMO movimiento de cualquier tipo; `valor_anterior` se captura/muestra pero NO se usa para desambiguar cuál editar. (2) `informe` slot-prefill sin alcance por empresa (siempre todas). (3) recurrente sin empresa ni día del mes. (4) "Editar" en la tarjeta abre el flujo desde cero (no pre-rellena). (5) exec functions sin unit test (I/O; los normalizadores puros sí, +46 tests).

### Cambios 2026-05-31 (rediseño dashboard + cleanup comandos — deploy)

Branch `feat/dashboard-redesign` (commit `8bb0c57`, stackeada sobre `feat/bot-voice-intents`; PR pendiente de merge). Engram #749.

- **Gráfico A (Pulso mensual)**: `Charts.tsx` nuevo `AreaTrendChart` (área suave ingreso/gasto + línea de saldo fuerte, SVG puro + tokens `--chart-*`, sin dep de charts) reemplaza `TrendBars` (eliminado). `ResumenTab`: las 2 tarjetas ARS/USD → **1 tarjeta con toggle ARS/USD** + **leyenda interactiva** (chips Ingresos/Gastos/Saldo clickeables = mostrar/ocultar serie; el eje Y se reajusta a las series visibles vía prop `show: ChartSeriesVisibility`).
- **Config**: `ConfiguracionTab` orden Equipo → **Telegram** → Categorías → Drive.
- **Header**: `DashboardApp` app-bar con más peso (border-strong, shadow-md, +alto, monograma 36px + título 18px).
- **Agregar categorías**: nuevo `POST /api/categorias` en `routes/categorias.ts` (requireSession + canWriteToScope + canManageCategoriasOp, dedupe case-insensitive en scope, ownership `dashboardId ? {owner_user_id,dashboard_id} : {owner_user_id}`, cap 60). `api.createCategoria`. `CategoriasSection` con form de alta. Strict TDD: 3 tests en `api.test.ts` (create, dedupe, reject vacío) RED→GREEN.
- **Cleanup comandos bot** (opción "solo unificar"): `BOT_COMMANDS` eliminado de `menu.ts`; `FULL_COMMANDS` (quickActions.ts) es la **fuente única** (registerBotCommands lo consume; setScopedCommands sigue narrowing por rol). Mata el drift de doble lista. Handlers `agregar*`/`borrar*` intactos (decisión del dueño: no tocar).

**Deploy 2026-05-31:** Frontend Firebase Hosting `caja-chica-bot.web.app`. Backend Cloud Run rev **`caja-chica-00058-92k`** (por `POST /api/categorias`). Smoke prod: `/api/health` 200, `POST /api/categorias` sin auth → 401. Sin SQL nuevo, sin env vars nuevas. Tests 684 pass / 2 skip / 0 fail. tsc + build limpios.

**Pendiente QA visual**: gráfico A + header verificados por tsc/build + mockup (`mockups/redesign-preview.html`), no en prod con ojos.

### Cambios 2026-05-31 (Pulso por empresa + tamaño dinámico + layout + fixes Codex — deploy)

Branch `feat/dashboard-redesign` (commit `7f6621e`, stackeada sobre voz). Engram #749.

- **Pulso por empresa**: chips multi-toggle (mismo patrón que series) filtran la serie mensual. Helper puro `buildMonthlyChartData(history, currency, companies?)` en `dashboard/summary.ts` (+6 tests). "Todas" o subconjunto, guard contra apagar la última.
- **Tamaño dinámico**: `AreaTrendChart` alto `clamp(150, 240, 110 + n*22)` (compacto con pocos meses).
- **Layout adaptativo**: `ResumenTab` grid `lg:grid-cols-2`; Pulso `col-span-2` (full) con ≥4 meses, si no compacto al lado de "Gastos que más pesan".
- **Fixes Codex adversarial**: `POST /api/categorias` catch `23505` + refetch (race) + dedupe `select("*")` (contrato Categoria); no apagar última serie + aria solo visibles; editor con `manage_categorias` ve Categorías (ConfiguracionTab); +3 tests auth (dashboard insert / viewer 403 / editor sin permiso 403).

**Deploy 2026-05-31:** Frontend Firebase Hosting `caja-chica-bot.web.app`. Backend Cloud Run rev **`caja-chica-00059-59b`**. Tests 693 pass / 2 skip / 0 fail. Sin SQL, sin env vars nuevas. PRs (voz + rediseño) pendientes de merge en GitHub.

### Cambios 2026-06-01 (Design System v2 "Petróleo y Terracota" + 8 features — deploy)

Branch `feat/dashboard-redesign`. Engram #750. **OJO: la North Star de DESIGN.md cambió** de "Bosque y Niebla" (rechazaba glass/gradiente) a **"Petróleo y Terracota"** con glass tempered. DESIGN.md es la fuente de verdad.

- **Re-skin v2** (Fase 0 DESIGN.md + Fase 1 + 1.5): tokens `--app-*` en hex — light "Terracota cálida" (off-white tibio, canvas `#F1E8DE`), dark "Petróleo Mint" (`#07100D`, acento mint `#5EE9B5`). `--app-strong-surface` = mint (marca/acción primaria/tab activo). Gradiente radial solo en `body`. `.glass-chrome` (backdrop-blur) **solo** en header + barra de tabs; tarjetas de datos sólidas. Botones primarios `bg-neutral-900`→mint; montos/banners/spinners → tokens. Radios SIN cambio.
- **Header**: sin título de página; izq = brand + **Nueva operación** (CTA mint → Movimientos); der = Buscar · tema · rol · avatar.
- **Resumen**: Flujo de caja (waterfall `buildCashflowBridge`, +6 tests) · callout Atención + KPI Utilidad crítico (neto<0) · Insight del período · Etiquetas destacadas. `MetricCard` +props `sub`/`critical`, fix `bg-white`.
- **Recurrentes**: 4 KPIs + calendario heatmap (`buildRecurrentesSummary`, +6 tests, reusa `expandOccurrences`).
- **Empresas**: 4 KPIs agregados + lista Salud por empresa.
- **Movimientos**: filtros mes/empresa/moneda + iconos editar/copiar/eliminar (ya existían).
- **Categorías**: `PATCH /api/categorias/:id` (rename + dedupe 409 + **cascade a `movimientos.categoria` en scope**, +3 tests) · `api.updateCategoria` · edición inline en `CategoriasSection`.
- **Config**: Telegram (BotConnectionPanel) agrupado con Drive como "Integraciones".

**Deploy 2026-06-01:** Frontend Firebase Hosting `caja-chica-bot.web.app`. Backend Cloud Run rev **`caja-chica-00060-sdh`** (por `PATCH /api/categorias`). Smoke: `/api/health` 200, `PATCH /api/categorias/:id` sin auth → 401. Tests 705 pass / 2 skip / 0 fail. tsc + build limpios. Sin SQL, sin env vars nuevas. **QA visual pendiente** (re-skin + features verificados por tsc/build, no en prod con ojos). Mockups: `mockups/app-full-redesign-v2.html`.

### Cambios 2026-06-01 (rework Resumen v3 + píldora flotante mobile — deploy)

Branch `feat/dashboard-redesign-v3` (commit `0d91c74`, PR #5). Engram #751. Mockup aprobado: `mockups/app-redesign-v3.html`. **Cambio solo frontend** (sin backend/SQL/env vars).

- **Resumen**: sacadas "Etiquetas destacadas" y "Empresas / frentes más fuertes". "Insight del período" + nueva "Comparativa vs mes anterior" lado a lado (ingresos/gastos/utilidad con ▲▼ + delta %; color por semántica: ingresos/utilidad ↑=verde, gastos ↑=rojo). "Pulso mensual" ahora ancho completo (hero). "Flujo de caja" compacto en 2-col con "Gastos que más pesan" (antes full-width desbalanceado).
- **`src/dashboard/summary.ts`**: nuevo helper puro `buildMonthlyComparison(summaries, currency)` → `{hasPrev, ingresos/gastos/utilidad:{deltaPct, current}}`. `deltaPct=null` si no hay mes previo o `prev=0`. +4 tests (`tests/monthlyComparison.test.ts`). Se eliminó `richData` (col-span) de ResumenTab.
- **Mobile**: **píldora flotante** `fixed bottom-center` (`sm:hidden`, glass-chrome rounded-full compacta) con **Buscar** + **Nueva** (solo `canWriteData`). En mobile se ocultan el CTA "Nueva operación" y el botón de búsqueda del header (migran a la píldora). Web/desktop sin cambios.
- **RecurrentesTab**: ya matcheaba el screenshot (4 KPIs + heatmap + lista), no se tocó.
- **Deploy**: Frontend Firebase Hosting `caja-chica-bot.web.app`. Tests 712 pass / 2 skip / 0 fail. tsc + build limpios.

### Cambios 2026-06-02 (sesión extendida: UI rework v3 + 6 features + fixes — deploy)

Sesión grande. PRs #5–#13 mergeados a `main`. Backend rev **`caja-chica-00063-vfv`**. Tests **724 pass / 2 skip / 0 fail**. Flujo: feature branch → `gh pr merge --merge` (push a main bloqueado por hook) → deploy. Frontend Firebase + Backend Cloud Run (cuando cambió backend).

**Rediseño dashboard v3** (`feat/dashboard-redesign-v3` y stack):
- Resumen: "Comparativa vs mes anterior" (`buildMonthlyComparison` en `summary.ts`) al lado de Insight; Pulso full-width (hero); Flujo de caja compacto 2-col con "Gastos que más pesan". Sacadas "Etiquetas destacadas" + "Empresas/frentes más fuertes".
- Píldora flotante mobile (`sm:hidden`, bottom-center) con Buscar + Nueva → abre modal de carga. CTA header + búsqueda ocultos en mobile.
- Recurrentes: "Próximos recurrentes" caja principal (primero DOM, arriba en mobile) con **+Nuevo** en header (`SectionCard` nuevo prop `action`). Sacada barra inferior Total/Proyección (redundante con KPIs).
- Empresas: sacado ranking/comparación; tarjetas debajo de "Salud por empresa"; **Agregar empresa** dentro de la caja principal; Salud muestra ingresos+gastos+saldo (grid 3-col alineado); **toggle ARS/USD** filtra KPIs+Salud+tarjetas.
- Config: secciones en `grid xl:grid-cols-2` (Cuenta full-width). Telegram+Drive en **una card "Vinculación"** (BotConnectionPanel + DriveSection refactor a "bare"); deep link Telegram oculto si token expiró.
- Admin: Mantenimiento inmediato|programar y Email settings|test-send en `grid md:grid-cols-2` (apilan en mobile). Form de invitar afinado.
- **ScrollToTop** flotante (`src/components/ScrollToTop.tsx`, aparece >400px, scroll suave + reduced-motion).

**Movimientos** (`pagination.ts` + `CargaModal.tsx`):
- Centro de carga inline ELIMINADO → **modal "Cargar"** (`CargaModal`, portal, foco, Esc, ⌘/Ctrl+Enter, drop foto/PDF). Botón "Cargar" (4º) en el header de "Historial de movimientos" (vía `SectionCard action`). Píldora mobile + CTA header abren el modal.
- **Paginación numerada 10/pág** (`pageSlice`/`totalPages`/`pageList` con elipsis, TDD) reemplaza "Cargar más". `movementsPage` en DashboardApp, reset a 1 en cambio de filtro, scroll-to-top al paginar. El `›` fetchea next server page si estás en la última cargada.

**Features nuevas:**
- **Empresa nueva reactiva**: `getCompanySummaries(history, extraCompanies)` siembra empresas sin movimientos con ceros → aparece al instante (PR #7).
- **Superadmin elimina cuentas**: `DELETE /api/admin/users/:id` (requireSuperadmin). Borra membresías + auth user + app_users; **conserva movimientos/empresas**. Guards `cannot_delete_self`, `last_superadmin`. Audit `account_delete`. AdminPanel: "Zona peligrosa" en el detalle con confirmación tipeando el email (PR #7).
- **Backup manual**: `POST /api/me/backup` (informes router) `{destination:local|drive}` → **ZIP de 3 CSV** (movimientos/empresas/categorias) scoped al dashboard. `src/server/zip.ts` (encoder store sin deps) + `backup.ts` (toCsv + buildBackupZip, TDD). Botón en Config→Tu cuenta; pregunta destino si Drive disponible. `api.downloadBackup` (blob) + `api.backupToDrive` (PR #10).
- **Ayuda/FAQ** (`HelpModal.tsx`, desde menú de usuario): comandos de voz, **glosario jerga** (mango $1/luca $1.000/gamba $100/palo $1.000.000/verde=USD/k=×mil), recomendaciones + FAQ acordeón. **Reportar problema**: `POST /api/support/report` (me router, rate-limit `tierSupportReport` 3/día) → email a superadmins vía Brevo con contexto auto (email/rol/sección/fecha/UA), fire-and-forget. `api.reportProblem` (PR #13).
- **Onboarding tour** (`TourModal.tsx`): 4 pasos, portal + progress dots, auto-show 1ª vez (localStorage `tour_seen`), re-lanzable desde menú. Independiente de WelcomeWizard (PR #13).
- **PWA install** (`PwaInstall.tsx`): `usePwaInstall` captura `beforeinstallprompt` (Android nativo) / detecta iOS → modal instrucciones "Compartir→Agregar a inicio". `PwaInstallBanner` flotante 1ª vez (dismiss 7d). "Instalar app" en menú (PR #13).
- **Login** (`LoginScreen`): chips de valor (Telegram/voz/foto) + "¿Problemas para entrar?" desplegable (mailto + pedir invitación). Sin auth nuevos (PR #13).

**Fixes UI:**
- `--app-border-strong` subido (dark `#385348`→`#4C7363`, light `#C4B3A1`→`#B09A82`) → botones/inputs cliqueables contrastan más (PR #9).
- Modales unificados: portal obligatorio + `rounded-2xl` 4 bordes + fondo `surface-1` + backdrop `color-mix 42%` full-screen. RecurrenteModal tenía `bg-black/40` sin portal (backdrop atrapado) + `dark:strong-surface` (mint) → corregido (PR #8).
- **Marrón → blanco**: auditoría completa de `bg-surface-2` (claro = marrón #EBE0D3). Grupo 1 (9 recuadros de contenido: filas categoría, caja cuenta, /start manual, invitación/permisos/deep link, details admin, preview modal) → `surface-1` (PR #11, #12). Chips/toggles/hover/skeletons/empty intactos.
- Alineación de títulos consistente (MiembrosSection `pt-7 md:pt-9`); MovimientosTab/AdminPanel tarjetas a tokens estándar.

**Decisiones:** ZIP de CSVs (no JSON) para backup porque JSON es opaco al usuario. Sin backup automático ni restaurar (fuera de alcance). Reportar problema = box en Ayuda (no página aparte) con contexto auto.

**Pendiente post-deploy:** QA visual prod claro+oscuro (tour, banner PWA mobile real, Ayuda, disparar reporte real pa' confirmar mail). Actualizar `setMyCommands`/inline mode BotFather. Mockups de referencia en `mockups/` (wireframe-*, auditoria-marron). DESIGN.md sin cambios este batch.

### Cambios 2026-06-03 (sesión extendida: biométrico + fixes + paletas — deploy)

PRs #15–#27 a `main`. Backend rev **`caja-chica-00066-bpz`**. Tests **735 pass / 2 skip / 0 fail**. Front Firebase + Back Cloud Run.

- **Fix menú usuario tapado** (PR #15): header `<header className="relative z-30">` — el dropdown vivía en el header `glass-chrome` (stacking context z:auto) y la barra de tabs sticky `z-20` lo tapaba.
- **Login pulido** (PR #16): chips Telegram/Voz/Foto en `grid grid-cols-3` alineado (labels cortos); botones a `rounded-md`.
- **App-lock biométrico** (PR #17): `src/lib/biometricLock.ts` (WebAuthn platform authenticator, `userVerification:required`; `shouldPromptUnlock` puro gracia 90s + tests). `src/components/BiometricGate.tsx` envuelve DashboardApp en App.tsx; bloquea al reabrir/volver, auto-intento, fallback cerrar sesión. Toggle en CuentaSection. **Frontend-only**: credencial en el device, sesión sigue Supabase, NO reemplaza login. iOS 16+/Android Chrome.
- **Revocar miembro lo saca del Equipo** (PR #18, #19): MiembrosSection filtra `status==="revoked"`. Backend `/api/dashboard/members/:id/revoke` ahora también revoca la `dashboard_invitations` asociada (la lista de Equipo se arma desde invitations, no members). Scope ya filtra `status=active` (acceso cortado).
- **Modal detalle no queda colgado al eliminar cuenta** (PR #18): AdminPanel `setSelectedUserId(null)` al borrar (antes solo `setDetail(null)` → spinner infinito).
- **Registro de personas en INVITACIONES** (PR #23): `GET /api/admin/invitations` enriquece con `invited_by_email` (col `invited_by` ya existía — NO se necesitó migración) + `membership_of` (cruce `dashboard_members` → dueños de dashboards donde la persona es miembro hoy; queries batched). AdminPanel: badges "Invitada por X" + "Miembro de: Y" / "Cuenta independiente". Revocar 🗑 ya existía.
- **Filtro "Activas"** (PR #26): "Todas"→"Activas" en INVITACIONES = excluye Aceptadas (siguen bajo filtro "Aceptada"). El registro real de personas = columna izquierda "Dashboards y miembros".
- **4 paletas de color extra** (PR #27): capa **`data-palette`** en `<html>` ORTOGONAL al `data-theme` claro/oscuro. `src/theme/palettes.ts` (PALETTES + read/apply/storage `caja-chica:palette`). index.css: bloques `[data-theme="light"][data-palette="arena"|"marfil"]` + `[data-theme="dark"][data-palette="medianoche"|"carbon"]` — overridean tokens estructurales+acento; semánticos (verde/rojo/amber) heredan del modo base. App.tsx: estado `palette` + setter que FIJA el modo de la paleta. Selector "Paleta" en PreferenciasSection (Predeterminada + 4). **Predeterminada = Terracota/Petróleo (default sin cambios)**. Props App→DashboardApp→ConfiguracionTab→PreferenciasSection.
- **WIP backend deployado** (rev `caja-chica-00066-bpz`): `dataScope.ts`, `telegramAccess.ts`, `routes/movimientos.ts`, bot `movements`/`extraction` (+6 tests). Quedaron en `main` por un `git add src` que barrió working tree; el dueño confirmó que eran intencionales → se deployaron. **Lección: usar `git add <archivos puntuales>`, nunca `git add src` con WIP sin commitear.**

**Mockups nuevos:** `mockups/themes-12-opciones.html` (6 claras + 6 oscuras), `wireframe-login-ayuda-faq.html`, `wireframe-invitaciones-dashboard.html`.

### Cambios 2026-06-03 (branding real + E2E Playwright + cleanup repo — deploy)

PR #32 mergeado a `main` (merge `3c35608`). Solo frontend, sin backend/SQL/env vars.

- **Branding (BrandMark + logos)** — nuevo `src/components/BrandMark.tsx` (variantes `badge`/`login`/`full`) reemplaza el placeholder `ShieldCheck` + badge de texto "CC". Cableado en `DashboardApp` (header, `badge`), `AppLoadingScreen` (`full`), `LoginScreen` (`login`, centrado, wordmark a `sr-only` + ThemeToggle reposicionado arriba-derecha). Assets en `/public`: `logo-caja-chica{,-header,-login,-login-source}.{png,svg}` + `favicon.png`. Iconos PWA (192/512/maskable) regenerados desde el logo. `index.html` link favicon; `vite.config.ts` PWA `includeAssets` → `favicon.png` (antes `icon.svg`). DESIGN.md §5 nuevo bloque "Marca / BrandMark".
- **E2E Playwright** — `@playwright/test` (devDep) + `playwright.config.ts` + `e2e/login-smoke.spec.ts` + script `npm run e2e`. Fix glob de tests unit: `node --test $(find tests -name '*.test.ts' | sort)` (orden determinístico vs `**` del shell).
- **Cleanup repo**: borrada basura de otro proyecto (`mockup-{operador,proyectores,tecnico}.html` = "I/O Proyectores", `generate_config.py`). `.gitignore` += `.agents/`, `AGENTS.md` (AGENTS.md deprecado), `.clauderules`.
- **`.clauderules` untrackeado** (estaba committeado por error en `c4e9dd0`): es un artefacto **generado** por el hook `UserPromptSubmit` (`skill-injector match $(git diff) > .clauderules`, o `rm -f` si el árbol está limpio). Trackearlo causaba borrados fantasma en `git status`. Ahora gitignored y regenerado local por sesión.
- **Deploy**: Frontend Firebase Hosting `caja-chica-bot.web.app`. `tsc --noEmit` + `vite build` limpios. Sin cambio de backend.

### Pendiente
- **Activar inline mode en BotFather** (manual, SOLO el dueño — no automatizable): `/setinline @<bot>` (placeholder ej. "4500 luz") + `/setinlinefeedback @<bot>` al **100%**. Sin el feedback, `chosen_inline_result` no dispara y el guardado inline queda muerto.
1. Test envío real email Brevo (sistema deployed, no probado in-vivo todavía — disparar invite real desde `/admin` o `/configuracion → Equipo`)
2. Validar onboarding wizard end-to-end con cuenta nueva real (browser-driven, requiere login Google nuevo)
3. Refactor `createApp` (complexity 309 según trailmark) — deuda estructural, no vuln activa. Candidato para `/codex:rescue --background --effort high "split createApp into Express routers"`
4. Spacing rhythm tokens (`--space-tight/snug/comfort/relaxed/section/hero` + `.stack-*` utilities) listos en `index.css` pero no aplicados aún a ConfiguracionTab / InformesTab
5. **Rotar keys pegadas en chat**: Brevo (`xkeysib-...`, sesión 2026-05-25) + `GEMINI_API_KEY_2` (sesión 2026-05-28). Ambas quedaron en claro en el historial. Rotación = generar nueva en consola del proveedor (Brevo: SMTP & API → API Keys; Gemini: aistudio.google.com → API keys), borrar la vieja, y `gcloud run services update caja-chica --update-env-vars <VAR>=<nueva> --region us-west2`.
6. Smoke test full browser Personas (visual): invitar real → ver UI → click acciones

---

