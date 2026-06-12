# ROADMAP — Caja Chica

> **Para el asistente (Claude/Gemini/etc.):** cuando el owner pregunte *"¿qué queda pendiente?"*, *"¿qué hay para hacer?"*, *"¿qué sumamos?"* o similar → **respondé desde este archivo**. Es la fuente de verdad del backlog. También está en engram (`topic_key: future-features/backlog`), pero ESTE archivo es el que se lee rápido y no requiere búsqueda.
> Mantener sincronizado: cuando el owner mande guardar una idea/feature pendiente, agregala acá Y a engram.

---

## ✅ Hecho y live (no pendiente)
- Persistir líneas de ticket (movimiento padre + líneas hijas editables): web modal-first + Telegram save-first + editar/borrar líneas + recompute del total. Fases A–E + diferido. End-to-end verificado en prod por el owner.
- Selección de ítems de ticket en web + PDF + discoverability.
- Pills de empresa en el gráfico de flujo de caja.
- **Agente LLM para preguntas sobre gastos** (2026-06-10): `answerQuestion()` con loop tool-calling JSON sobre tools scopeadas en memoria (`src/server/askAgent.ts`). Web: `POST /api/ask` (con `history` multi-turno) + `AskChat` flotante disponible en todos los tabs. Telegram: `/preguntar` + intent `consultar` por voz/texto (single-turn). ⏳ pendiente verificación del owner en prod.
- **Resúmenes de tarjeta/banco** (2026-06-10): `document_kind` en el prompt de tickets → routing a `CREDIT_CARD_SUMMARY_SYSTEM_PROMPT` → transacciones al flujo batch del bot con fecha real. ⏳ pendiente verificación del owner en prod (mandar un PDF de resumen real).
- **Insight de salud IA** (2026-06-12, migración aplicada): tabla `ai_events` + `GET /api/admin/ai-health` + card en Super Admin → Sistema. Mide cuánto se agota la key primaria de Gemini (fallback) y cuántas caídas duras hubo. Empieza a registrar desde ahora.
- **Canal WhatsApp** (ports & adapters) — construido y testeado SIN Meta; INERTE hasta la plomería de Meta (ver CLAUDE.md "Canal WhatsApp" y la sección WhatsApp abajo).

---

## 🎯 Pendientes — prioridad del owner

### 0. Dashboards personal/pyme — revisar flujo antes de migrar
Backend + UI **listos y deployados** (`dashboards.ts`, `DashboardSwitcher`, endpoints `GET/POST /api/dashboards` + `PATCH /api/me/active-dashboard`), pero **INERTES**: la migración `db/patches/dashboard_types_phase.sql` (columnas `dashboards.type`/`cuit`/`cuil` + `app_users.active_dashboard_id`) **NO está aplicada a propósito** — falta revisar el **flujo de cómo la persona crea/cambia** entre personal y pyme antes de prender. Decisión del owner 2026-06-12.
- Nice-to-have (atado a Monotributo): tracking detallado de **IIBB / Ganancias** + sección fiscal en la UI pyme (hoy solo se capturan CUIT/CUIL, no se muestran ni trackean).

### 1. AFIP / ARCA — Monotributo
- El usuario elige su **categoría (A-H) una sola vez** en Config → Monotributo. **NO carga topes ni montos.**
- Topes anuales por categoría viven en el **código** (`src/config/monotributo_limits.ts`); el owner los actualiza cuando el gobierno los sube.
- La app suma automáticamente lo cargado (voz/foto/texto) en el mes/año y compara contra el tope → **semáforo / "nivel de Mario Bros"**: ej *"Llevás $900.000, te faltan $200.000 para subir de categoría"*.
- Cron diario `POST /api/cron/monotributo`: suma del período vs tope fijo.
- **Objetivo final:** bajando los informes de AFIP + cruzando con los datos propios →
  - **(a) Proyectar:** margen anual restante y si va a pasar de categoría.
  - **(b) CSV para la contadora:** export "Cierre Mensual" listo para el contador (atado a la Fase 3 / `AccountantExport`).

---

## 🗺️ Roadmap amplio (contexto estratégico, mercado AR)

### Fase 1 — Acceso / Guest Mode (usar la IA sin crear cuenta)
- `src/components/GuestDemo.tsx`: pantalla "Modo Demo" que reemplaza el login por defecto.
- `POST /api/extract-guest`: endpoint **público** (sin `requireSession`), mismo `RECEIPT_SYSTEM_PROMPT`.
- Tabla `guest_extractions` (TTL 24hs): `{ user_id, image_url, result_data, created_at }`.
- `POST /api/me/claim-guest`: al loguear, mueve los datos de `guest_extractions` a `movimientos`.
- Flujo: Landing → "Probalo ahora" → sube foto → ve resultado live → pide email para guardar.

### Fase 2 — Valor real / Cotización
- `dolarapi.com` (sin API key): `GET https://dolarapi.com/v1/dolares` cada hora, cachear (memoria o tabla).
- `movimientos.rate` (columna numérica nueva): al crear un movimiento en USD, guarda la tasa del día.

### Fase 3 — Profesionalismo / Exportador + AFIP
- `src/server/reports/AccountantExport.ts`: generador PDF/CSV "Cierre Mensual" para el contador (sobre el motor propio `reportExports.ts`). ← el CSV para la contadora del pendiente #1 (Monotributo).
- `InformesTab.tsx`: botón "📊 Exportar para Contador".
- `src/config/afip_deadlines.ts`: vencimientos fijos en código (Monotributo ~día 5-20, IIBB día 20). Notificación automática vía el **Recordatorio Diario de Telegram** existente. Botón "Avanzar vencimiento" para el caso particular (ARCA cambió la fecha); si no se toca, asume estándar.

### WhatsApp como canal de entrada (esquema 2026-06-10, mediano plazo)
Mismas funciones que el bot de Telegram, vía **WhatsApp Business Cloud API oficial** (descartado Baileys/no-oficial: riesgo de ban). Análisis de acoplamiento hecho: el "cerebro" ya es puro (`askAgent`, prompts/parsers de `gemini`, `reportExports`, `recurrentes`, `voiceIntent`/`intentSlots` — cero grammY) y `extractItemsFromBuffer()` ya extrae desde Buffer; lo acoplado son los 18 archivos de `src/bot/` (grammY Context + inline keyboards) y la descarga de media.

Arquitectura objetivo: **ports & adapters** — `src/channels/contract.ts` (`ChannelContext`: reply/sendMenu/sendFile/downloadMedia→Buffer/identity) + adapters `telegram/` y `whatsapp/`; la lógica conversacional migra a `src/flows/` sin canal. UI: inline keyboards → reply buttons (máx 3) / list messages (máx 10) / numerado. Identidad: tabla `whatsapp_links` espejo de `telegram_links` (phone en vez de chat_id), mismo doble factor. Sesiones: Maps actuales con key prefijada `tg:`/`wa:` (single-instance invariant se mantiene). Costo: conversaciones iniciadas por usuario gratis (ventana 24h); recordatorios salientes requieren template aprobado pago → decidir si quedan solo en Telegram.

Fases shippeables: **0)** refactor media Buffer-first + keys de sesión prefijadas (sin comportamiento nuevo, sirve a Telegram ya) → **1)** `ChannelContext` + adapter Telegram idéntico (riesgo principal: refactor de 18 archivos; mitigación: un comando por PR, suite de tests como contrato) → **2)** plomería WA (Meta Business, webhook verify, `whatsapp_links`) → **3)** texto/audio + `/preguntar` (casi gratis, intents y askAgent ya puros) → **4)** fotos/PDF/statements vía `extractItemsFromBuffer` + list messages → **5)** informes/recurrentes/recordatorios (decisión de templates pagos).

**Estado (2026-06-11): TODO lo que no es plomería de Meta está construido y testeado SIN Meta** (ver CLAUDE.md "Canal WhatsApp"). Hecho ✔: Fase 0 (media Buffer-first), `ChannelContext`+`FakeChannel`, adapter Telegram (en prod para `/preguntar`), núcleos channel-agnostic en `src/flows/` (ask/reports/recurring/extraction), adapter WhatsApp (spec-reviewed vs docs vivos de Meta), identidad por teléfono + router + write-path doble-factor + rutas HTTP + UI dashboard, flows guiadas WhatsApp informes/recurrentes, harness offline (`tests/helpers/waSim.ts`).
- ⏳ **Pendiente NO-plomería**: carga de gasto por texto libre + foto/ticket en WhatsApp → requiere extraer `persistTelegramMovement`/`persistTelegramTicket` (en `bot/commands/movements.ts`, acoplado a Telegram) a un flow channel-agnostic. Refactor grande.
- ⏳ **Plomería de Meta (último)**: cuenta Business + número, transport real a `/PHONE_NUMBER_ID/messages`, webhook GET verify + POST → `handleWhatsAppMessage`, token, **aplicar `db/patches/whatsapp_links_phase.sql`**. Hasta entonces las rutas `/api/whatsapp/*` y la UI están INERTES (tablas no existen, sin webhook).

---

## 🧹 Deuda técnica / operativa (chica)
- Rotar la anon key de Supabase (quedó expuesta en la sesión de CI/CD).
- ~~Actualizar GitHub Actions a Node 24~~ ✔ hecho 2026-06-10 (`deploy.yml` node-version 24; Dockerfile runtime sigue en node 22).
- ~~Mover deps de frontend a `devDependencies`~~ ✔ hecho 2026-06-10 (commit `6081242`). Movidas: vite, @vitejs/plugin-react, @tailwindcss/vite, react, react-dom, lucide-react, sonner, @tanstack/react-query. Verificado: el backend (`tsx server.ts`) no importa ninguna en runtime — el grafo carga con `npm ci --omit=dev`.
