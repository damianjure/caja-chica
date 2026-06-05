# Caja Chica

App para registrar y consultar movimientos financieros en **lenguaje natural** (contexto rioplatense). Escribís _"pagué 4500 de luz"_ y queda registrado, categorizado y disponible en el dashboard.

Tres caras del producto:

- **Dashboard web** — React 19 + Vite + Tailwind v4
- **Backend HTTP** — Express + TypeScript
- **Bot de Telegram** — grammY (texto, foto/ticket, audio)

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind v4 |
| Backend | Express, TypeScript, tsx, grammY |
| Datos / Auth | Supabase (Postgres + Auth + Realtime) |
| IA | Google Gemini (`@google/genai`) |
| Infra | Cloud Run (backend `us-west2`), Firebase Hosting (frontend), Cloud Scheduler (crons) |
| Integraciones | Google Drive (export de informes), Brevo (emails) |

## Desarrollo

```bash
npm install

npm run dev          # backend Express + bot + sirve el dashboard (tsx server.ts)
npm run build        # build de producción del frontend (vite build)
npm run lint         # tsc --noEmit
```

### Tests

```bash
npm test             # unit (Node test runner nativo, sin Jest/Vitest)
npm run e2e          # E2E (Playwright)
```

## Estructura

```
.
├── src/                 # frontend (React) + backend (src/server) + bot (src/bot)
├── server.ts            # runtime entry: wiring de Express + bot + crons
├── tests/               # unit tests (node --test)
├── e2e/                 # Playwright
├── supabase/migrations/ # migraciones gestionadas por el Supabase CLI
├── db/                  # snapshot de schema + patches SQL históricos (aplicados a prod a mano)
├── docs/                # specs y planes
└── loadtest/            # scripts de carga
```

## Documentación

| Archivo | Qué contiene |
|---------|--------------|
| [`CLAUDE.md`](./CLAUDE.md) | Arquitectura, estado actual, reglas e invariantes |
| [`RUNBOOK.md`](./RUNBOOK.md) | URLs, deploy, infra, env vars, rotación de secretos |
| [`DESIGN.md`](./DESIGN.md) | Sistema de diseño |
| [`SCALE.md`](./SCALE.md) | Consideraciones de escala |
| [`CHANGELOG.md`](./CHANGELOG.md) | Historial cronológico de cambios |

## Deploy

Ver [`RUNBOOK.md`](./RUNBOOK.md). Resumen:

```bash
# Frontend → Firebase Hosting
npm run build && firebase deploy --only hosting --project caja-chica-bot

# Backend → Cloud Run (REGIÓN us-west2, NO el default de gcloud)
gcloud builds submit --tag gcr.io/caja-chica-bot/caja-chica --region us-west2
gcloud run deploy caja-chica --image gcr.io/caja-chica-bot/caja-chica --region us-west2 --platform managed
```

> ⚠️ Prod vive en **`us-west2`**. Verificá el target antes de cualquier deploy (ver RUNBOOK).
