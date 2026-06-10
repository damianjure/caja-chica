# ROADMAP — Caja Chica

> **Para el asistente (Claude/Gemini/etc.):** cuando el owner pregunte *"¿qué queda pendiente?"*, *"¿qué hay para hacer?"*, *"¿qué sumamos?"* o similar → **respondé desde este archivo**. Es la fuente de verdad del backlog. También está en engram (`topic_key: future-features/backlog`), pero ESTE archivo es el que se lee rápido y no requiere búsqueda.
> Mantener sincronizado: cuando el owner mande guardar una idea/feature pendiente, agregala acá Y a engram.

---

## ✅ Hecho y live (no pendiente)
- Persistir líneas de ticket (movimiento padre + líneas hijas editables): web modal-first + Telegram save-first + editar/borrar líneas + recompute del total. Fases A–E + diferido. End-to-end verificado en prod por el owner.
- Selección de ítems de ticket en web + PDF + discoverability.
- Pills de empresa en el gráfico de flujo de caja.
- **Agente LLM para preguntas sobre gastos** (2026-06-10): `answerQuestion()` con loop tool-calling JSON sobre tools scopeadas en memoria (`src/server/askAgent.ts`). Web: `POST /api/ask` + `AskBox` en tab Resumen. Telegram: `/preguntar` + intent `consultar` por voz/texto. ⏳ pendiente verificación del owner en prod.
- **Resúmenes de tarjeta/banco** (2026-06-10): `document_kind` en el prompt de tickets → routing a `CREDIT_CARD_SUMMARY_SYSTEM_PROMPT` → transacciones al flujo batch del bot con fecha real. ⏳ pendiente verificación del owner en prod (mandar un PDF de resumen real).

---

## 🎯 Pendientes — prioridad del owner

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

---

## 🧹 Deuda técnica / operativa (chica)
- Rotar la anon key de Supabase (quedó expuesta en la sesión de CI/CD).
- Actualizar GitHub Actions a Node 24 (antes de sept-2026).
- Mover deps de frontend (vite, @vitejs/plugin-react, @tailwindcss/vite, react, react-dom, lucide-react, sonner, @tanstack/react-query) a `devDependencies` → imagen Docker ~30-40% más chica. Requiere verificar que el workflow de CI buildee el frontend ANTES del `docker build` (ya lo hace: `npm ci` full → `vite build` → `docker build --omit-dev`). Sin riesgo de runtime porque el bundle está en `dist/` y el servidor solo sirve estáticos.
