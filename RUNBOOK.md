# RUNBOOK — Caja Chica (repo: caja-chica)

> Operación: URLs, deploy, infra, variables de entorno, rotación de secretos.
> NO se autocarga en sesiones de Claude — consultar al deployar o tocar infra.

---

## 2. URLs, proyectos y entornos reales

### Frontend producción
- [https://caja-chica-bot.web.app](https://caja-chica-bot.web.app) ← migrado 2026-05-08 desde `balancediario` (proyecto roto)

### Backend producción
- [https://caja-chica-442790495206.us-west2.run.app](https://caja-chica-442790495206.us-west2.run.app)

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

## Deploy manual

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

## Cómo correr tests
```bash
node --import tsx --test tests/**/*.test.ts
# o por archivo:
node --import tsx --test tests/api.test.ts tests/permissions.test.ts tests/telegramAccess.test.ts
```

---

## 15. Infra, Docker y deploy

### Frontend
- Firebase Hosting / proyecto: `caja-chica-bot` (default en `.firebaserc`)
- URL prod: `https://caja-chica-bot.web.app`

### Backend
- Cloud Run / proyecto GCP: `caja-chica-bot`
- imagen: `gcr.io/caja-chica-bot/caja-chica`
- servicio Cloud Run: `caja-chica` región `us-west2`
- **`min-instances=0` desde 2026-05-26** (rev `caja-chica-00045-dpj`) — instancia se apaga cuando no hay tráfico
- **`max-instances=1` desde 2026-05-28** (rev `caja-chica-00048-fz7`) — antes `=20`. Bajado para respetar el single-instance invariant (decisión #18): los flujos multi-step del bot y el OAuth de Drive guardan estado en Maps en memoria; con webhook + N instancias los updates del mismo chat podían rutear a instancias distintas y romper la sesión. `concurrency=80` sobra para el volumen actual.
- `concurrency=80`, `CPU=1`, `memory=512Mi`
- cold start estimado: 2-5s en primera request post-idle (bot Telegram tolera; Cloud Scheduler timeout 30s)

### Cloud Scheduler (us-west2)
4 jobs disparan los endpoints `/api/crons/*` con header `X-Cron-Secret`:
- `crons-reminders` — `* * * * *`
- `crons-maintenance` — `* * * * *`
- `crons-recurrentes` — `0 8 * * *`
- `crons-invite-reminders` — `0 10 * * *`

Service account: `cron-invoker@caja-chica-bot.iam.gserviceaccount.com` (`roles/run.invoker`).

### Secret Manager
- `caja-chica-cron-secret` v1 — backup del valor `CRON_SECRET` (Cloud Run env var + Cloud Scheduler headers). Permite recovery si se pierde.

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
| Deploy frontend Firebase Hosting (user settings) | ✔ deployado 2026-05-12 |
| Deploy backend Cloud Run (user settings) | ✔ deployado 2026-05-12 |
| `CRON_SECRET` env var en Cloud Run | ✔ configurada 2026-05-26 |
| Deploy backend con cron endpoints | ✔ rev `caja-chica-00044-5vv` (2026-05-26) |
| 4 Cloud Scheduler jobs creados + smoke-tested | ✔ 2026-05-26 |
| Cloud Run `min-instances=0` | ✔ rev `caja-chica-00045-dpj` (2026-05-26) |
| Secret backeado en Secret Manager | ✔ `caja-chica-cron-secret v1` (2026-05-26) |

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
- `CRON_SECRET` ← shared secret para endpoints `/api/crons/*` (Cloud Scheduler header `X-Cron-Secret`). Fail-closed: si no está seteado, todos los requests a `/api/crons/*` devuelven 401. Generar: `openssl rand -hex 32`

### IA
- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2` ← opcional. Segunda key de fallback. Si presente, las llamadas de texto reintentan con esta key cuando la primary agota cuota (429). Si ausente, `genAI2 = null` y solo hay degradación elegante. Configurada en Cloud Run rev `caja-chica-00047-bqv` (2026-05-28)

### Google Drive ← configuradas en Cloud Run 2026-05-07
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI` ← debe ser `https://caja-chica-442790495206.us-west2.run.app/api/drive/callback`
- `TOKEN_ENCRYPTION_KEY` ← base64 de 32 bytes: `openssl rand -base64 32`

### Email (Brevo) ← migrado 2026-05-20
- `BREVO_API_KEY` ← requerida para envío de emails de invitación (formato `xkeysib-...`)
- `FROM_EMAIL` ← default `hola@damianjure.com` (sender verificado en Brevo)
- `FROM_NAME` ← default `Caja Chica`

### Runtime general
- `PORT`
- `NODE_ENV`

---

