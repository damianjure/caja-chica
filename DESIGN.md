---
name: Caja Chica
description: Dashboard financiero en lenguaje natural para contexto rioplatense
colors:
  canvas: "oklch(95.5% 0.008 155)"
  surface-1: "oklch(98.5% 0.005 155)"
  surface-2: "oklch(93.5% 0.009 155)"
  surface-3: "oklch(89% 0.012 155)"
  surface-4: "oklch(85% 0.014 155)"
  border: "oklch(85% 0.014 155)"
  border-strong: "oklch(77% 0.018 157)"
  text-1: "oklch(23% 0.014 165)"
  text-2: "oklch(39% 0.016 160)"
  text-3: "oklch(52% 0.016 158)"
  text-4: "oklch(64% 0.014 156)"
  strong-surface: "oklch(23% 0.014 165)"
  strong-text: "oklch(97% 0.006 155)"
  red-text: "oklch(51.5% 0.150 30)"
  green-text: "oklch(49.1% 0.115 150)"
  amber-text: "oklch(49% 0.108 70)"
  blue-text: "oklch(47% 0.110 258)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  2xl: "1.5rem"
  pill: "9999px"
spacing:
  tight: "0.5rem"
  snug: "0.75rem"
  comfort: "1rem"
  relaxed: "1.5rem"
  section: "2rem"
  hero: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.strong-surface}"
    textColor: "{colors.strong-text}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.5rem"
  button-primary-hover:
    backgroundColor: "{colors.strong-surface}"
    textColor: "{colors.strong-text}"
  button-ghost:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.5rem"
  button-ghost-hover:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.xl}"
    padding: "1.75rem 2rem"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
  tab-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  tab-card-active:
    backgroundColor: "{colors.strong-surface}"
    textColor: "{colors.strong-text}"
    rounded: "{rounded.xl}"
---

# Design System: Caja Chica

> ## 📐 Cómo usar este documento (source of truth)
>
> Este archivo es **la fuente de verdad de UI/UX de Caja Chica**. Ante **cualquier** tarea de diseño, layout, estilo, color, tipografía, componentes o estados visuales: **leer esto primero y ajustarse a las reglas de acá** antes de escribir o cambiar UI.
>
> **Separación de responsabilidades (regla anti-drift):**
> - **`src/index.css` = valores exactos de tokens** (los `--app-*`: colores, sombras, radios, duraciones). Es el **canon de runtime**. Si un valor de este doc no coincide con `index.css`, **gana `index.css`**.
> - **`design.md` (este archivo) = reglas, filosofía y convenciones de componente.** Atemporal. No duplica valores hex/OKLCH que vivan en `index.css` (por eso driftean).
> - **`src/components/dashboard/primitives.tsx` + `src/components/ui/` = implementación.** Las primitivas son la forma canónica; ver §11.
>
> **El frontmatter de arriba (`colors`/`components`) es ILUSTRATIVO/legacy** (valores "Bosque y Niebla" previos) — NO es el canon. Para valores reales, ir a `index.css`.
>
> **Al cerrar una tarea de UI:** si establecés una convención nueva o cambiás una regla, actualizá la sección correspondiente acá en la misma pasada (adopción incremental, sin sweeps masivos).

## 1. Overview

**Creative North Star: "Petróleo y Terracota"** *(evolución de "Bosque y Niebla" — decisión 2026-05-31)*

Caja Chica es un dashboard financiero para registrar y consultar movimientos en lenguaje natural rioplatense. El sistema visual nace de una idea simple: las finanzas personales no necesitan gritar. La paleta evolucionó a dos modos paralelos con más identidad: **dark "Petróleo Mint"** (fondo petróleo profundo, casi negro verdoso, + acento mint brillante) y **light "Terracota cálida"** (off-white tibio tintado a terracota, nunca blanco puro que quema la vista). El dato financiero se lee sin esfuerzo y sin alarma.

La densidad es media: aire generoso entre grupos conceptuales, filas compactas dentro de las tarjetas. La jerarquía se construye con escala y peso tipográfico, no con color. El color semántico (rojo, verde, ámbar, azul) está reservado exclusivamente para diferenciar tipos de movimiento y estados; nunca decora. El acento de marca (mint) marca la acción primaria y la pestaña activa.

El sistema usa **glass con moderación** (decisión 2026-05-31): el efecto vidrio (`backdrop-blur` translúcido) va SOLO en el "chrome" (header/app-bar y barra de pestañas), donde casi no hay texto detrás; las tarjetas de datos son SÓLIDAS para no comprometer contraste ni performance. El fondo de la app es un **canvas plano** (`--app-canvas`, sin gradiente). Sigue rechazando: glass sobre tarjetas de datos, gradientes detrás de cifras, la plantilla hero-métrica, y la iluminación de fondo en hover (el feedback de hover sigue siendo el resalte de borde).

**Key Characteristics:**
- Dos modos paralelos: dark "Petróleo Mint" y light "Terracota cálida", no una inversión
- Acento de marca mint; color semántico (rojo/verde/ámbar/azul) reservado para significado financiero
- Glass SOLO en chrome (header + tabs); tarjetas de datos sólidas; fondo de app plano (sin gradiente)
- Jerarquía por escala y peso; hover = resalte de borde, nunca relleno
- Radios y formas SIN cambio respecto del sistema previo (rounded-md botones, rounded-xl tarjetas)
- Tipografía única (Inter Variable, self-hosted); peso de pills reforzado (bold)

## 2. Colors

Neutrales sage perceptualmente uniformes con cuatro acentos semánticos de baja saturación. La cromática se reduce cerca de los extremos de luminosidad (ley OKLCH).

### Primary
- **Tinta Bosque** (`oklch(23% 0.014 165)`): la superficie/texto fuerte. Acción primaria (botones), pestaña activa, texto principal. Es el ancla oscura del sistema; en dark mode se invierte a una niebla clara (`oklch(96% 0.008 155)`).

### Neutral
- **Niebla** (`oklch(95.5% 0.008 155)`): el lienzo de la app (`canvas`).
- **Superficie 1** (`oklch(98.5% 0.005 155)`): tarjetas, paneles, inputs. La capa elevada.
- **Superficie 2-4** (`oklch(93.5% → 85% ...)`): capas de profundidad tonal para contenedores anidados, fondos de fila y elementos diferenciados.
- **Borde** (`oklch(85% 0.014 155)`) y **Borde Fuerte** (`oklch(77% 0.018 157)`): el borde fuerte es el estado de hover de todo elemento cliqueable.
- **Texto 1-4** (`oklch(23% → 64% ...)`): rampa de jerarquía textual, de principal a sutil.

### Tertiary (acentos semánticos)
- **Rojo** (`oklch(51.5% 0.150 30)`): egresos.
- **Verde** (`oklch(49.1% 0.115 150)`): ingresos, estado activo/vinculado.
- **Ámbar** (`oklch(49% 0.108 70)`): advertencias, estados pendientes.
- **Azul** (`oklch(47% 0.110 258)`): información, rol editor.

### Named Rules
**La Regla de la Niebla.** Los neutrales nunca son grises puros: todos llevan un tinte de hue 155-165. El gris plano está prohibido.

**La Regla del Color Semántico.** Rojo, verde, ámbar y azul solo diferencian tipos de movimiento y estados. Nunca se usan como decoración ni para jerarquía visual. Si un color no comunica un significado financiero, no va.

**La Regla de la Superficie Fuerte.** El acento de marca (mint) y/o la tinta fuerte aparecen solo en la acción primaria y la pestaña activa. Su rareza es lo que la hace legible como "lo importante".

### Paleta aplicada — v2 "Petróleo / Terracota"

**Los valores exactos de cada token viven en `src/index.css`** (los `--app-*`, por modo claro/oscuro, más los bloques `data-palette`). Este doc NO los duplica para no driftear. La intención de marca:

- **Dark · "Petróleo Mint":** fondo petróleo profundo (casi negro verdoso) + acento **mint** brillante para marca/acción. Neutrales tintados a verde, nunca gris plano.
- **Light · "Terracota cálida":** off-white tibio tintado a terracota (**nunca** blanco puro) + acento mint un poco más oscuro para AA sobre crema.
- **Semánticos** (rojo gasto / verde ingreso / ámbar pendiente / azul info): el hue se conserva en ambos modos; en dark son versiones más claras y desaturadas.

**Fondo de la app:** `--app-canvas` **plano** (un solo color por modo, sin gradiente). Nunca gradiente por tarjeta.

### Paletas opcionales (capa `data-palette`) — 2026-06-03

Los dos modos default (Terracota claro / Petróleo oscuro) son la **paleta Predeterminada**. Se sumaron 4 paletas extra **seleccionables por el usuario** en Configuración → Preferencias → Paleta.

**Mecánica (buenas prácticas):** atributo **`data-palette`** en `<html>`, ORTOGONAL al `data-theme` (claro/oscuro). Cada paleta es CSS-only: un bloque `[data-theme="<modo>"][data-palette="<id>"]` en `index.css` que **overridea solo los tokens estructurales + acento** (`--app-canvas`, `--app-surface-1..4`, `--app-border(-strong)`, `--app-text-1..4`, `--app-strong-surface/text`, `--chart-baseline`). Los **tokens semánticos** (verde ingreso / rojo gasto / amber / azul) **se heredan del modo base** para no perder el significado del color. **Se elige una paleta clara Y una oscura por separado** (3 opciones c/u, incluida Predeterminada); al togglear claro/oscuro se aplica la del modo activo y queda guardada. Persistencia: `caja-chica:palette-light` + `caja-chica:palette-dark`. Lógica en `src/theme/palettes.ts`; estado en `App.tsx` (`applyPalette(theme, lightId, darkId)` en effect sobre `theme`).

| Paleta | Modo | Acento | Notas |
|---|---|---|---|
| **Predeterminada** | claro/oscuro | mint `#147E60` / `#5EE9B5` | Terracota / Petróleo (default, sin cambios) |
| Niebla & Azul Tinta | claro | azul tinta `#1F6F78` | fría/perlada, claramente distinta de Terracota |
| Marfil & Terracota | claro | terracota `#C2541F` | cálida bold |
| Medianoche & Violeta | oscuro | violeta `#8C6BF0` | navy frío |
| Carbón & Ámbar | oscuro | ámbar `#E0922F` | gris neutro + acento cálido |

Regla: **agregar paletas = nuevo bloque `data-palette` en `index.css`** + entrada en `PALETTES` (`src/theme/palettes.ts`). NO tocar componentes (todo via tokens `--app-*`). Mockup de referencia: `mockups/themes-12-opciones.html` (hay 6 claras + 6 oscuras; se cablearon 4).

### La Regla de la Superficie de Vidrio (glass)
El `backdrop-blur` translúcido va SOLO en el chrome: **header/app-bar y barra de pestañas**. Las tarjetas de datos (`section`, `card`, tablas) son SÓLIDAS (`surface-1`, borde 1px, `shadow-sm`). Motivo: app de cifras/tablas + PWA móvil → el blur por tarjeta cuesta GPU y el panel translúcido sobre el gradiente degrada el contraste del texto. Glass = identidad; sólido = legibilidad.

## 3. Typography

**Display / Body / Label Font:** Inter Variable (con `ui-sans-serif, system-ui, sans-serif` de fallback), self-hosted en `/public/fonts/` como woff2 con ejes variables (wght 100-900, slnt -10 a 0).

**Character:** Una sola familia para todo el sistema. Inter es neutra, altamente legible a tamaños chicos y con `tabular-nums` para columnas de cifras. La personalidad viene del contraste de peso y escala, no de la elección de fuente.

### Hierarchy
La escala sigue una razón ≥1.25 entre pasos (tokens `--text-xs` a `--text-5xl`, base 16px).
- **Display** (700, 1.875rem/30px, line-height 1.1, tracking -0.02em): título principal del dashboard.
- **Headline** (700, 1.25rem/20px, line-height 1.25, tracking -0.01em): títulos de sección (`SectionCard`).
- **Title** (600, 1.125rem/18px): subtítulos, encabezados de bloque.
- **Body** (400, 1rem/16px, line-height 1.5): texto corrido. Limitar a 65-75ch (`max-w-prose`).
- **Label** (700, 0.75rem/12px, tracking 0.1em, MAYÚSCULAS): etiquetas de campo, encabezados de métrica, eyebrows.

### Named Rules
**La Regla del Número Tabular.** Toda cifra monetaria usa `tabular-nums` para que las columnas alineen. Las cifras no son texto corrido.

**La Regla de la Etiqueta Discreta.** Las etiquetas (label) van más chicas, en mayúsculas y con tracking amplio. Apoyan al dato, nunca compiten con él.

## 4. Elevation

Sistema híbrido: capas tonales por defecto, sombra como respuesta a estado o jerarquía. La profundidad principal se logra con la rampa `surface-1` a `surface-4`, no con sombras. Las sombras son tokens theme-aware (`--app-shadow-sm/md/panel`) que se ajustan entre light y dark mode.

### Shadow Vocabulary
- **sm** (`0 1px 2px rgba(40,30,10,0.06)`): elevación mínima. Tarjetas de métrica, tarjetas de pestaña en reposo.
- **md** (`0 4px 12px -2px rgba(40,30,10,0.10), 0 1px 3px rgba(40,30,10,0.06)`): acción primaria, pestaña activa.
- **panel** (`0 8px 24px -6px rgba(40,30,10,0.14), 0 2px 6px rgba(40,30,10,0.06)`): el panel header elevado, modales.
- **flotante** (`0 14px 40px rgba(0,0,0,0.28)` aprox): chrome que debe despegarse fuerte del canvas oscuro — barra de pestañas y panel del chat de IA. Borde `border-strong` + esquinas `rounded-2xl`.

### Named Rules
**La Regla del Chrome que Flota** (2026-06-12, antes "Tarjeta que Levita"). La barra de navegación por pestañas y el panel del chat de IA **flotan**: borde `border-strong`, esquinas `rounded-2xl` y sombra **flotante** marcada, para despegarse del canvas oscuro (antes la barra era plana y se veía chata). Las tarjetas de datos dentro del contenido siguen levitando por contraste de capa (`surface-1` más claro + `shadow-sm`), no por brillo. Regla: el **chrome** flota con sombra; las **tarjetas de datos** levitan con capa tonal.

**La Regla del Borde en Hover.** Ningún elemento cliqueable se ilumina (cambia su fondo) en hover. El feedback de hover es siempre el resalte del borde a `border-strong`. La iluminación de fondo está prohibida en elementos tipo botón, tarjeta o chip. (Excepción: los ítems apilados de un menú desplegable usan un fondo sutil `surface-2`, porque el borde no aplica a una lista apilada.)

**La Regla de Touch Eleva, Stat Aplana** (2026-06-14). Una tarjeta tappable (navega o filtra) va **elevada**: `surface-1` + `shadow-md` + lift sutil en hover (`-translate-y-0.5`). Una tarjeta de solo lectura va **plana y recedida**: `surface-2`, sin sombra. El usuario distingue "tocable" de "dato" de un vistazo, sin leer. Signifier extra: chevron `›` = navega · check `✓` = filtro activo · sin adorno = solo lectura. (Resolvió el problema de las MetricCard que parecían botones pero no hacían nada.)

## 5. Components

### Buttons
- **Shape:** `rounded-lg` para botones; `rounded-xl` para elementos tipo tarjeta cliqueable.
- **Primary (canónico):** fondo `strong-surface`, texto `strong-text`. **Toolbar/acción de tarjeta:** `rounded-lg px-3 py-2 text-xs font-semibold` (Cargar, Exportar, Nuevo recurrente, Nueva empresa). **En fila de formulario** (al lado de inputs): mantiene `px-5 py-3` para igualar la altura del input, mismo `rounded-lg font-semibold`. El componente `Button` (`ui/Button.tsx`) es la forma preferida; los botones inline se migran a esta receta al tocar el archivo.
- **Ghost:** fondo `surface-1`, borde `border`, texto `text-2`, `shadow-sm`.
- **Danger:** outline rojo (`border-red-200`, `bg-red-50`, `text-red-600`); reservado para acciones destructivas.
- **Hover / Focus:** el borde pasa a `border-strong` (o al tono fuerte del color en botones semánticos). Sin cambio de fondo. `active:scale-[0.97]` da el feedback de click. Focus visible: outline de 2px.

### Chips
- **Filtro de empresa:** pill (`rounded-full`). No seleccionado: `surface-1` con borde, hover resalta el borde. Seleccionado: `strong-surface` con texto invertido. Las acciones de editar/eliminar aparecen inline dentro del pill seleccionado, nunca flotando por fuera.
- **Categoría:** pill `surface-3` con la acción de eliminar inline (ícono chico que enrojece en hover).
- **Badge de estado:** pill con color semántico de baja saturación, variante dark con `bg-{color}-500/15 + text-{color}-200`.
- **Peso (v2, 2026-05-31):** los pills usan `font-weight` bold (≈700), más presencia que el body. El pill seleccionado va sólido (acento/strong); los no seleccionados, borde + texto atenuado.

### Modals
- **Portal rule:** Todo modal o dialog que use `position: fixed` para el backdrop DEBE renderizarse con `createPortal(document.body)`. Sin portal, el `fixed` queda atrapado en ancestros con `transform` (ej. `anim-fade-in` en tab panels) y el backdrop no cubre la pantalla completa.
- **Backdrop:** `fixed inset-0 z-[200] backdrop-blur-[2px]` + `color-mix(in srgb, var(--app-text-1) 42%, transparent)`.
- **Shell (`ModalShell`):** `rounded-2xl`, `max-h-[90vh]`, scroll interno en el body.
- **Compact dialogs (`ConfirmModal`, `ConfirmDestructive`):** `rounded-2xl`, `max-w-[400px]`, sin header separado.

### Cards / Containers
- **Corner Style:** `rounded-xl` (1rem) tarjetas estándar; `rounded-2xl` (1.5rem) solo para shells de modal y paneles hero.
- **Background:** `surface-1` sobre el lienzo `canvas`.
- **Shadow Strategy:** `shadow-sm` en reposo (ver Elevation).
- **Border:** `border` de 1px, siempre completo. El border-left/right de color como acento está prohibido.
- **Internal Padding:** `1.75rem 2rem` (escala `relaxed`/`section`).

### Tarjetas de métrica e interacción (2026-06-14)
- **`MetricCard`:** sin `onClick` = `<div>` stat plano (ver Regla de Touch Eleva). Con `onClick` = `<button>` elevado con chevron, `aria-label` y target ≥44px. Misma firma, dos afordancias según si es interactiva.
- **Atajos del Resumen:** cada métrica navega al detalle — Ingresos/Gastos/Utilidad/USD → Movimientos con el filtro puesto; Empresas/Recurrentes → su tab. El estado de filtros vive en `DashboardApp`, así que el atajo es `setX(...)` + `setActiveTab(...)` (espeja el `onDrilldown` de Empresas).
- **`FilterCard` (Movimientos):** 4 tarjetas que **reemplazan** el segmented de tipo/moneda (Todos / Ingresos / Gastos / En USD). Tocar filtra la lista; la activa se ilumina por significado (verde/rojo) con check. Muestran el **total global** (de `getCurrencyTotals(history)`, sin filtrar), no el conteo filtrado.
- **Empresas — datos propios:** no repite los totales del Resumen; muestra Más gasta · Mejor saldo (tappables, drillean a esa empresa) · Empresas activas · En rojo (stats).
- **Agrupación:** en páginas mixtas (Empresas) las tappables van juntas en una fila y las stats en otra, para que el patrón visual sea legible.
- **Touch targets:** los botones de ícono de acción (editar/copiar/borrar en cards de movimiento, pausar/editar/borrar en Recurrentes) usan `h-11 w-11` (44px, WCAG 2.5.5) — el ícono queda chico, crece el área tocable.

### Movimientos: card en desktop, fila en mobile (2026-06-14)
Patrón `hidden md:grid` / `md:hidden` (como los charts): el desktop mantiene las **cards** (1 por movimiento); el mobile usa una **lista densa tipo extracto de banco** (ícono tipo + categoría + `empresa · categoría · fecha` + monto firmado a la derecha, ~6 por pantalla). Tocar la fila abre el **editor** (las acciones salen del medio); los renglones de ticket se expanden con un toggle de recibo al final de la fila. Para que el borrado sobreviva la mudanza, el **editor de movimiento ahora tiene botón Borrar** (rojo, a la izquierda del footer). Viewers: la fila no es botón (solo lectura).

### Primitivas del design system (2026-06-15)
Componentes reutilizables en `src/components/ui/`. **Convención de adopción incremental:** los componentes nuevos SIEMPRE usan estas primitivas; al tocar un archivo con botones/inputs/selects inline, se migran en la misma pasada (no hay sweep masivo). Migrados hasta ahora: `DashboardModals`, `CargaModal`, `RecurrenteModal`, toolbar de `MovimientosTab`, filtros de `RecurrentesTab`, form de `EmpresasTab`.

- **`Button`** (`ui/Button.tsx`): variantes `primary` (strong-surface) · `secondary` (borde) · `danger` (borde rojo) · `ghost`; tamaños `sm` (`px-3 py-2 text-sm`) / `md` (`px-4 py-3`). A11y built-in: `focus-visible:ring`, `disabled:opacity + cursor-not-allowed`, `type="button"` por defecto. Hereda props nativos (`ComponentPropsWithoutRef<'button'>`).
- **`Field`** (`ui/Field.tsx`): `Input` / `Textarea` / `Select`. El prop `label` es **obligatorio por tipos** → imposible un control sin nombre accesible (tapa de raíz el placeholder-as-label). Props: `hideLabel` (label sr-only, mantiene look placeholder-only sin rediseñar), `required` (asterisco rojo si el label es visible), `error` (mensaje inline al pie + borde rojo + `aria-invalid`/`aria-describedby`, no limpia el input), `options` (Input → `<datalist>` autocompletar), `size` sm/md. Patrón de validación: mostrar errores **solo tras intento de submit**.
- **`Segmented`** (`ui/Segmented.tsx`): control segmentado para filtros mutuamente excluyentes (tipo/período). `tones` pinta el segmento activo verde/rojo (income/expense). Compartido por Movimientos y Recurrentes.
- **`MetricCard` `hero`** (`dashboard/primitives.tsx`): variante de número grande (`text-4xl`, auto-fit a 40px, padding mayor), ancho completo, `delta` opcional. **Regla de ancho del valor:** el `pr` para el chevron solo va en el renglón de la etiqueta; el número usa el ancho completo de la card (si no, se recorta en columnas 2-up). Auto-fit floor 12px (no-hero) para cifras largas.
- **`MetricChip`** (`dashboard/primitives.tsx`): pill compacta para **conteos** que no deben competir con cifras de plata (ej. "Empresas 4", "Recurrentes 3"). Tappable si recibe `onClick`.

### Jerarquía del dashboard (2026-06-15)
Cada pestaña lleva **un número que manda** arriba, no una fila plana de cards iguales. Resumen: hero Utilidad + Ingresos/Gastos secundarias + chips (Neto USD/Empresas/Recurrentes). Recurrentes: hero Impacto 30 días. Empresas: **sin hero** (pestaña comparativa, sin número dominante único) — 2 cards accionables + chips. Movimientos: las `FilterCard` cumplen el rol (son filtros, no métricas). **Progressive disclosure mobile:** en Resumen los charts secundarios (Comparativa, Flujo de caja, Etiquetas) se colapsan en mobile detrás de "Ver análisis" y quedan siempre visibles en desktop — patrón CSS puro `${open ? '' : 'hidden md:block'}` + botón `md:hidden`, sin JS de media query.

### Inputs / Fields
- **Style:** fondo `surface-1`, borde `border` de 1px, `rounded-md`.
- **Focus:** `focus:ring-2` con el color de texto principal; sin glow de color.
- **Placeholder:** `text-3` — **nunca** como único label (usar `Field` con `label`).

### Navigation
- **Tab nav (desktop):** `hidden md:flex`, contenedor plano `surface-2` (glass en v2). Cada pestaña levita; activa con acento/`strong-surface` + `shadow-md`. Semántica de **navegación** (`role="navigation"` + `aria-current="page"`), no `tablist`/`tab` (no hay `tabpanel` ni navegación por flechas; el patrón tab a medias confundía a los lectores de pantalla).
- **Affordance de scroll (2026-06-14):** la tira hace `mask-image` fade en los bordes **solo cuando hay overflow real** (listeners de scroll/resize comparando `scrollWidth`/`clientWidth`), y **auto-centra la pestaña activa** al cambiar (`scrollIntoView`).
- **Bottom-nav (mobile, 2026-06-15):** `sm:hidden fixed bottom-0`, ícono + label corto por pestaña, `aria-current="page"`. Target ≥44px (`py-2`). Montada **fuera** del wrapper transformado del pull-to-refresh (si no, `fixed` queda atrapado). Respeta `safe-area-inset-bottom`. En mobile el título de pantalla vive en el header sticky, no en la tab bar.
- **Swipe entre secciones (mobile):** `useSwipeNav` (gesto horizontal en `window`, umbral 50px, dominancia 1.3, ignora scrollers horizontales internos) cambia de pestaña con transición direccional (`anim-slide-in-right/left` según `navDir`).
- **Back cierra modal (`useBackClose`):** al abrir un modal se hace `history.pushState`; el Back de Android/navegador lo cierra en vez de salir de la página. Aplicado a todos los modales de `DashboardApp` + create/edit/delete de Recurrentes.
- **Páginas multi-sección (Configuración + Super Admin) — mismo patrón:** en **desktop**, sidebar vertical sticky a la izquierda (`hidden lg:block w-48 shrink-0 sticky top-4`, item activo `bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-medium`) + contenido en columna `flex-1 min-w-0`. En **mobile**, barra de pills horizontal scrolleable (`lg:hidden`, pill activa `bg-[var(--app-surface-2)]`). Render del contenido **una sola vez** dentro de `lg:flex` (no duplicar mobile/desktop, para no portalar modales dos veces). Es el layout canónico de toda página con 3+ sub-secciones.

### PWA / Safe areas (2026-06-15)
`viewport-fit=cover` en `index.html` es **requisito** para que `env(safe-area-inset-*)` valga distinto de 0 en iOS con notch — sin él, toda la chamba de safe-area (bottom-nav, ScrollToTop, pull-to-refresh, OfflineBanner) queda inerte. El contenedor del dashboard lleva `pt-[max(1rem,env(safe-area-inset-top))]` para que el header no quede bajo la barra de estado en standalone (status-bar `black-translucent`). PWA: `vite-plugin-pwa` (manifest + icono maskable, precache del app-shell, `NetworkOnly` para `/api`/Supabase/Cloud Run — la data financiera nunca se cachea).

### Header / App-bar (v2, 2026-05-31)
Glass (chrome), sticky. **Sin título de página** (redundante con la sección activa). Layout:
- **Izquierda:** monograma + wordmark "Caja Chica" + CTA primario **Nueva operación** (acento mint, atajo a cargar movimiento).
- **Derecha (en orden):** Frescura (refresh + hora) · Buscar (⌘K) · toggle de tema (Claro/Oscuro) · badge de rol (Dueño) · avatar de usuario.
- **Frescura (2026-06-14):** botón de refresh (`RefreshCw`, gira con `isLoading`, recarga vía `loadData(false)`) + hora de última actualización, estampada en cada cambio de `history` (incluido el push de realtime). Da confianza de que el dashboard refleja lo cargado por Telegram. En mobile la hora se oculta (`hidden sm:inline`), queda solo el ícono.

### Marca / BrandMark (2026-06-03)
Logo real reemplaza el placeholder anterior (ícono `ShieldCheck` + badge de texto "CC"). Componente `BrandMark` con 3 variantes que apuntan a assets en `/public`:
- `badge` → `logo-caja-chica-header.png`, `h-11 w-11 rounded-lg` (app-bar, monograma).
- `login` → `logo-caja-chica-login.png`, `h-20 w-20 rounded-xl` (LoginScreen, centrado, wordmark a `sr-only`).
- `full` (default) → `logo-caja-chica.png`, `h-16 w-16 rounded-xl` (AppLoadingScreen).
`loading="eager"` (above-the-fold). `favicon.png` + iconos PWA (192/512/maskable) regenerados a partir del mismo logo. El acento mint de marca (color) sigue rigiendo la acción primaria/pestaña activa; el logo es la identidad visual, no compite con el acento.

### Selector de hora (componente firma)
Selector tipo alarma para la hora del recordatorio: dos steppers (hora ±1, minutos ±5) con chevrons arriba/abajo y la cifra en `font-mono` en el medio, separados por dos puntos. Compacto, integrado en la fila de configuración.

### Toggle / Switch
Interruptor de permiso/preferencia. `role="switch"` + `aria-checked`, con label `sr-only`. Track `rounded-full`; off `surface-3`, on `strong-surface`. El thumb se desliza con `--duration-quick`. Usado en permisos de miembro (`MiembrosSection`) y toggles de preferencia.

### Dropdown / ActionMenu
Menú de acciones por fila (ej. `PersonasPanel`). Trigger con `aria-haspopup="menu"` + `aria-expanded`; panel `role="menu"`, items `role="menuitem"`. Teclado: flechas ↑/↓ + Escape. Es la ÚNICA excepción a la Regla del Borde en Hover: los ítems apilados usan fondo sutil `surface-2` (el borde no aplica a una lista apilada).

### Toasts (sonner)
Notificaciones efímeras vía `sonner`, ancladas `bottom-center`. Confirmaciones de acción ("Movimiento guardado", "Link copiado"). No bloquean, se apilan, autodesaparecen. Color semántico solo cuando comunica estado real (rojo error / verde éxito).

### Charts / Gráficos del Resumen (responsive, 2026-06-08)
SVG puro + tokens (`--chart-income/expense/net/baseline`), sin librería externa. **No hay hooks de media query: las variantes se eligen por clases Tailwind `hidden md:block` / `md:hidden`** — el desktop queda intacto, el mobile es una vista aparte. Componentes en `src/components/dashboard/Charts.tsx`.
- **`AreaTrendChart` (Pulso mensual):** desktop = trazos con la cifra de saldo flotando sobre cada punto. Mobile = trazos limpios (sin texto encima, ilegible a ese ancho) + una fila de tarjetas con números grandes: últimos 2 meses (ingreso/gasto) y **saldo actual** destacado en una tarjeta con borde de acento `--chart-net`.
- **`WaterfallChart` (Flujo de caja):** desktop = barras verticales tipo puente. Mobile = **barras horizontales tipo lista**, una fila por paso (`grid-cols-[5.5rem_1fr_auto]`): etiqueta · barra centrada en la línea base (verde a la derecha = suma, rojo a la izquierda = resta) · monto grande. El saldo final va separado abajo con borde superior.
- **Regla:** en mobile el número se lee como dato (tarjeta/fila), el SVG solo comunica tendencia. Nunca texto chico incrustado en el SVG a ancho mobile.

## 6. Motion

El movimiento es funcional, nunca decorativo (coherente con la Regla del Color Semántico: nada adorna). Transiciones cortas que confirman causa→efecto.

### Tokens
- **Easing:** `--ease-out-quart` `cubic-bezier(0.25,1,0.5,1)` (default global), `--ease-out-quint`, `--ease-out-expo`. Todas out-curves: rápido al entrar, suave al asentar.
- **Duración:** `--duration-instant` 90ms · `--duration-quick` 180ms (default) · `--duration-base` 260ms · `--duration-slow` 420ms.
- **Default global:** todo elemento transiciona con `ease-out-quart` + 180ms salvo override explícito.

### Keyframes de entrada (`@layer utilities`)
- `.anim-fade-in` (180ms) — contenido de tab.
- `.anim-fade-in-down` (180ms) — entrada desde arriba.
- `.anim-scale-in` (200ms) — escala sutil, modales/popovers.
- `.anim-backdrop-in` (160ms) — fade del backdrop de modal.
- `.anim-card-in` (180ms) — entrada de tarjetas.

### Named Rules
**La Regla del Movimiento Honesto.** Una animación solo existe si comunica un cambio de estado (entró algo, se confirmó algo). Sin loops, sin paralaje, sin movimiento ambiental.

**La Regla del Reduced-Motion.** Todo `.anim-*` se anula bajo `@media (prefers-reduced-motion: reduce)` (`animation: none`). El movimiento es progressive enhancement, nunca requisito para entender la UI.

**El feedback de click** es `active:scale-[0.97]` (§5 Buttons), no una animación de color.

**Pull-to-refresh (gesto, 2026-06-14).** Solo mobile. Hook propio `usePullToRefresh` (listeners de touch en window, stdlib, sin lib externa): un arrastre **vertical-dominante** desde el tope de la página (`scrollY === 0`) crece con resistencia; al soltar pasando el umbral dispara `loadData(false)`. La dominancia vertical evita pelear con los scrollers horizontales (tabs, filas). Un spinner flotante (`RefreshCw`) sigue el dedo y gira mientras recarga; al llegar los datos, la marca de frescura (§5 Header) se actualiza. Encaja con el modelo Telegram-first: el gesto universal para "traeme lo último que cargué".

## 7. States (Loading / Empty / Error)

Estados de primera clase, no afterthoughts. Cada vista con datos define los tres.

### Loading
Skeletons tonales (`surface-2`/`surface-3`) que respetan el layout final, no spinners genéricos centrados. Componente: `LoadingStates.tsx`. El skeleton tiene la forma del contenido que viene.

### Empty
Primitive `EmptyState` (title + hint + CTA opcional gated por `canWrite`). Nunca una vista en blanco: título corto, hint de una línea, y si el usuario puede escribir, un CTA al composer. Aplicado en Resumen mensual, Ingresos/Gastos recientes.

**Telegram-first (2026-06-14):** el copy de los vacíos apunta a **Telegram como fuente de carga** ("Cargá por Telegram y aparece acá al toque"), no a un campo del dashboard — que en mobile no existe (se quitó el "↑ desde el campo de arriba" que apuntaba a la nada). La carga local queda como camino secundario. Refleja el modelo del producto: Telegram carga, el dashboard muestra.

### Error
Texto plano y accionable (Nielsen #9): qué pasó + cómo seguir. `role="alert"` para errores de carga/acción, `role="status"` para avisos no urgentes (banner `missing_url`). Nunca el código técnico crudo. Rojo semántico solo en borde/texto del callout, sin relleno alarmante.

### Offline (2026-06-15)
`OfflineBanner` (`components/OfflineBanner.tsx`) + hook `useOnlineStatus` (stdlib, `navigator.onLine` + eventos `online`/`offline`). Píldora fija arriba: ámbar "Sin conexión — los datos pueden estar desactualizados" mientras no hay red, luego verde "Conexión restablecida" 2,5s. `role="status"`/`aria-live`, `pointer-events-none`, respeta `safe-area-inset-top`. Montada **fuera** del wrapper transformado del pull-to-refresh (si no, el `fixed` queda atrapado). Cubre "sin red"; el "server caído con red" lo cubre el banner `load_error` de una fetch fallida (complementarios — `onLine` solo conoce la interfaz, no si el backend responde).

### Named Rules
**La Regla del Estado Triple.** Toda vista que carga datos define loading + empty + error explícitamente. "No hay datos todavía" es un diseño, no un bug.

## 8. Spacing & Density

Ritmo vertical por tokens, no por números mágicos (tokens en frontmatter: tight 0.5 → hero 3rem).

### Stacks (`@layer utilities`)
`.stack-tight/.stack-snug/.stack-comfort/.stack-relaxed/.stack-section/.stack-hero` — aplican `margin-top` al hermano siguiente (`> * + *`) con el espaciado del token. Reemplazan `space-y-*` ad-hoc por tokens del sistema.

### Densidad de fila
`.row-compact` (10/14px) · `.row-comfort` (14/16px) · `.row-airy` (18/20px) — padding de fila según contexto.

### Named Rules
**La Regla del Ritmo.** Aire generoso entre grupos conceptuales, filas compactas dentro de tarjetas (densidad media). Usar stacks tokenizados, no `mt-*` sueltos.

> **Deuda conocida (drift doc↔código):** los `.stack-*` están definidos pero NO aplicados aún en `ConfiguracionTab` ni `InformesTab` (usan `space-y-*` ad-hoc). Pendiente de migrar.

## 9. Accessibility

A11y es parte del sistema, no un parche. Auditado en 3 rondas (2026-05).

- **Touch targets:** mínimo 44×44px en todo control interactivo (botones icon-only, pills editar/eliminar, revoke).
- **ARIA:** `aria-label` en inputs y botones icon-only; `aria-pressed` en filter chips; `role="navigation"` + `aria-current="page"` en tab nav (NO `tablist`/`tab` — ver §5 Navigation); `role="switch"`+`aria-checked` en toggles; `role="menu"` en dropdowns; `aria-live`/`role="status"`/`role="alert"` en regiones dinámicas.
- **Foco:** `:focus-visible` con outline 2px tintado (`color-mix` con `--app-text-1`); nunca `outline: none` sin reemplazo.
- **Contraste:** texto crítico ≥ WCAG AA (4.5:1).
- **Teclado:** dropdowns navegables con flechas + Escape; modales con focus-on-mount + Escape; back button del browser nunca se rompe.
- **Movimiento:** `prefers-reduced-motion` respetado (§6).

### Named Rules
**La Regla del Contraste Mínimo.** Texto significativo nunca baja de `text-3`. `text-4` es solo decoración/separadores, jamás contenido legible.

## 10. Iconografía

**Regla central: "Icono = reconocimiento, no decoración."** Espejo de la Regla del Color Semántico. Un ícono existe para que el usuario identifique el contexto sin leer la etiqueta. Si la sola presencia del ícono no acelera el reconocimiento, no va.

### Familia y tamaño
- Familia exclusiva: `lucide-react` (ya presente en el proyecto). Sin mezcla de sets.
- Iconos monocromos: heredan el color del texto contenedor (`text-3` o el color del elemento padre). Nunca color decorativo propio.
- Tamaño estándar: 14–16px (`w-4 h-4`). En `EmptyState` se permite 32px (`w-8 h-8` con `strokeWidth={1.5}`) como anchor visual único en el estado vacío.

### Color en un ícono
Color SOLO cuando el ícono ES la señal semántica:
- Flecha de ingreso: verde (`text-green-600`) en el chip de tipo.
- Flecha de egreso: rojo (`text-red-600`) en el chip de tipo.
Nunca color decorativo en un ícono. La Regla del Color Semántico se aplica igual que en texto.

### Dónde van (aportan reconocimiento)
- **Tab nav:** ya implementado — ícono + label.
- **`MetricCard` label:** ícono opcional a la izquierda del label, monocromo `text-3`.
- **`SectionCard` header:** un único ícono opcional junto al título, monocromo `text-2`.
- **Chip de tipo en fila de movimiento (`MovementCards`):** `TrendingUp` (ingreso, verde) / `TrendingDown` (egreso, rojo) — ya implementado en el pill coloreado.
- **`EmptyState`:** ícono de contexto centrado, 32px, `text-neutral-400` — prop `icon?` ya existe.
- **Botón enviar del composer:** `Send` — ya implementado.
- **Pills de acción (editar/borrar/exportar):** `Pencil`, `Trash2`, `Copy` — ya implementados.

### Anti-patrones (NO)
- Un ícono por cada label o sección sin que aporte reconocimiento real.
- Iconos de color decorativos (rojo/verde que no diferencian tipo financiero).
- Iconos en texto corrido o párrafos de body.
- Affordances que no hacen nada: no agregar iconos de features inexistentes (ej. cámara/micrófono si la carga web de imágenes no existe aún).
- Doble indicador en la misma fila: si el chip de tipo ya tiene ícono semántico, no agregar además flecha en el monto.

### Named Rules
**La Regla del Ícono Único.** Por fila de movimiento, exactamente un indicador de tipo (el chip con TrendingUp/TrendingDown). El monto ya tiene color semántico y arrow text en otras vistas; no duplicar.

**La Regla del Ícono Silencioso.** El ícono apoya al texto; nunca reemplaza la etiqueta para el 100% de los casos. Todo ícono interactivo tiene `aria-label` en el botón padre. Todo ícono decorativo tiene `aria-hidden="true"`.

## 11. Implementation conventions (canon de código)

### Tokens de color — reglas de uso en código

| Caso de uso | Token correcto | Prohibido |
|---|---|---|
| Fondo de tarjeta / panel | `bg-[var(--app-surface-1)]` | `bg-white` |
| Fondo anidado / thead / hover | `bg-[var(--app-surface-2)]` | `bg-gray-*` |
| Fondo icon badge | `bg-[var(--app-surface-3)]` | colores fijos |
| Fondo de página | `bg-[var(--app-canvas)]` | `bg-white`, gradientes por tarjeta |
| Texto primario | `text-[var(--app-text-1)]` | `text-gray-900` |
| Texto secundario | `text-[var(--app-text-2)]` | `text-gray-500` |
| Texto hint / icon | `text-[var(--app-text-3)]` | `text-gray-400` |
| Borde default | `border-[var(--app-border)]` | `border-gray-200` |
| Borde activo / strong | `border-[var(--app-border-strong)]` | |
| Acento primario | `bg-[var(--app-strong-surface)]` / `text-[var(--app-strong-text)]` | `bg-green-*` |
| Monto ingreso | `text-[var(--chart-income)]` | `text-green-*` |
| Monto gasto | `text-[var(--chart-expense)]` | `text-red-*` |

**Regla absoluta:** nunca `bg-white` ni `dark:*` en componentes del dashboard ni en `src/components/ui/`. Los tokens semánticos (`var(--app-surface-1)`, `var(--app-text-2)`, etc.) ya son theme-aware — cambian solos con `[data-theme=dark]` vía CSS. Usar `dark:` encima de un token semántico es código muerto; encima de un color fijo (`dark:bg-gray-800`) es frágil y no usa el design system. Resultado: NUNCA se usa `dark:` en las clases de componentes.

### Padding unificado de tarjetas

| Componente | Padding | Notas |
|---|---|---|
| `MetricCard` | `px-5 py-4` (default), `px-6 py-5` (hero) | Primitivo en `primitives.tsx` |
| `KpiBadgeCard` | `px-5 py-4` | Primitivo en `primitives.tsx` |
| `SectionCard` | `px-6 py-6` | Primitivo en `primitives.tsx` |
| `CompanyDetailPanel` header/body | `px-5 py-4` | |
| Toolbar de tabla | `px-4 py-3` | |
| Celda de tabla (primera/última col) | `px-4 py-2.5` | header y body misma densidad |
| Celda de tabla (col interior) | `px-3 py-2.5` | |
| Footer de paginación | `px-4 py-3` | |
| Detalle panel header | `px-5 py-4` | |
| Detalle panel body | `px-5 py-4` | |

### Componentes compartidos en `primitives.tsx`

#### `MetricCard` — KPI estándar
Uso: ResumenTab (4-col grid), ResumenTab proyección, RecurrentesTab mobile.

```tsx
<MetricCard
  label="Ingresos del mes"
  value="$ 45.000"
  tone="success"          // 'neutral' | 'success' | 'danger' | 'warning'
  icon={TrendingUp}       // LucideIcon — opcional
  delta={{ text: '+12% vs ant.', tone: 'success' }}  // opcional
  sub="3 empresas"        // opcional
  onClick={() => nav('ingresos')}  // → touch card con shadow-md + chevron
  navLabel="Ver ingresos"
/>
```

#### `KpiBadgeCard` — KPI con badge de ícono
Uso: EmpresasTab, RecurrentesTab y AdminPanel (grid desktop). NO usar en mobile.

```tsx
<KpiBadgeCard
  label="Empresas activas"
  value="10"
  tone="danger"           // opcional: 'danger' | 'success' | 'warning'
  sub="mayor deuda: Delta"
  icon={Building2}        // LucideIcon
/>
```

Padding: `px-5 py-4`. Valor `text-2xl` (héroe). Icon badge con **tinte de marca**: `h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--app-strong-surface)_10%,var(--app-surface-2))]` + ícono `text-[var(--app-strong-surface)]` (los icon-badge neutros de otras vistas siguen `surface-3`).

**Convención de label de KPI (las 4 primitivas — `MetricCard`/`KpiBadgeCard`/`KpiCell`/`FilterCard`):** mismo eyebrow → `text-xs font-bold uppercase tracking-widest text-[var(--app-text-2)]`. Valor `text-2xl` (hero `text-4xl`). Ícono de acento en **mint** (`text-[var(--app-strong-surface)]`): inline en `MetricCard`, badge en `KpiBadgeCard`. Así mobile (`MetricCard`) y desktop (`KpiBadgeCard`) se leen como la misma familia aunque el layout difiera (apilada vs horizontal).

#### `SectionCard` — contenedor de sección
Uso: ResumenTab, EmpresasTab mobile, RecurrentesTab mobile, todas las secciones de Configuración.

```tsx
<SectionCard
  title="Resumen por frecuencia"
  description="Impacto mensual estimado."
  icon={Repeat}           // opcional
  action={<Button>...</Button>}  // opcional, va en el header derecho
>
  {children}
</SectionCard>
```

Fondo: `var(--app-surface-1)`. Padding: `px-6 py-6`. **Ya no usa `bg-white`.**

### Sticky headers

Los headers sticky (filtros, toolbar) nunca usan `bg-white`. **El fondo del sticky matchea la superficie del contenedor donde vive**, en TODOS los breakpoints — si no, queda una franja de otro color (un "recuadro" más oscuro/claro) inconsistente:
- **Dentro de un `SectionCard`** (caso típico: filtros de Movimientos) → `bg-[var(--app-surface-1)]` siempre (igual que la card y la tabla; nada de `canvas`, que se ve como un bloque oscuro sandwicheado).
- **Directo sobre el canvas de la página** (sin card contenedora) → `bg-[var(--app-canvas)]`.

```tsx
{/* sticky dentro de un SectionCard */}
<div className="lg:sticky lg:top-[60px] lg:z-10 bg-[var(--app-surface-1)] lg:-mx-6 lg:px-6 ...">
```

(El `-mx-6 px-6` debe igualar el padding horizontal del `SectionCard` contenedor — `px-6` — para que el sticky cubra el ancho completo sin desbordar.)

### Paneles de detalle (master-detail)

Los drawers de detalle son `position: fixed`, van de `top: var(--desktop-topbar-h)` a `bottom: 0`, ancla derecha. Ancho default **400px**, drag-to-resize 280–640px. **Siempre se renderizan con `createPortal(document.body)`** — sin portal, el `fixed` queda atrapado en ancestros con `transform` (pull-to-refresh) y no ocupa el alto correcto.

- **`MovementDetailDrawer`** — nivel `DashboardApp` (no portal, ya está fuera del pull-to-refresh div). Se cierra al cambiar de pestaña o página (`useEffect` sobre `[activeTab, movementsPage]`).
- **`CompanyDetailDrawer`** — nivel `EmpresasTab`, renderizado con `createPortal(document.body)` para evitar el stacking context del div con `transition: transform`. `onWidthChange` comunica el ancho al padre, que ajusta `paddingRight`.
- **Recurrentes:** panel lateral derecho en grid `lg:grid-cols-[minmax(0,1fr)_24rem]` (no drawer, no portal — no hay problema de stacking porque es layout estático).

Offset del contenido principal cuando el drawer está abierto: `paddingRight: ${width + 24}px` (inline style, no clase Tailwind — el ancho es dinámico por drag).

**Portal rule para drawers:** Todo drawer `position: fixed` que vive dentro de un componente hijo (no directamente en `DashboardApp`) DEBE usar `createPortal(JSX, document.body)`. Sin esto, el `transform` del pull-to-refresh (o cualquier otro `transform`/`will-change` en el árbol) cambia el "containing block" del fixed y el drawer no llega al borde del viewport.

### Headers de card unificados

Todas las cards de tabla desktop usan el mismo patrón de header:

```tsx
<div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--app-border)]">
  <div>
    <h3 className="text-base font-bold text-[var(--app-text-1)]">{título}</h3>
    <p className="text-xs text-[var(--app-text-3)]">{descripción}</p>
  </div>
  <div className="flex items-center gap-2 shrink-0">
    {/* toggles / botones de acción */}
  </div>
</div>
```

`text-base font-bold` para el título de card (distinto de `SectionCard` que usa `text-xl` — el `SectionCard` es un contenedor de sección completa, no de una card interna).

### Sort en tablas

**Columnas sortables:** usan un `<button>` dentro del `<th>` con icono `ChevronsUpDown` (inactivo, `opacity-70`) o `ChevronUp`/`ChevronDown` (activo). Alinear el icono a la derecha del label en columnas `left`, a la izquierda (con `flex-row-reverse`) en columnas `right`.

**Tablas con sort implementado:**
- `MovementsTable` — Fecha ↕ (default desc), Descripción ↕, Empresa ↕, Monto ↕. Categoría y Fuente: estáticas (no sortables, sin ícono).
- `EmpresasTab` — Empresa ↕, Movim. ↕ (default desc), Ingresos ↕, Gastos ↕, Saldo ↕, Última actividad ↕.

**Convención de `sortDir` default por key:** columnas numéricas y de fecha → `desc` (el mayor primero); columnas de texto → `asc` (A → Z).

### Badges de estado

Usar SIEMPRE los tokens semánticos — nunca colores de Tailwind fijos (`rose-100`, `violet-800`, `sky-200`, etc.) ni `dark:` overrides. Los tokens ya son theme-aware.

```tsx
// Activo / Éxito
<span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--app-green-surface)] text-[var(--app-green-text)]">Activo</span>

// Pendiente / Advertencia
<span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--app-amber-surface)] text-[var(--app-amber-text)]">Pendiente</span>

// Error / Revocado / Danger
<span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--app-red-surface)] text-[var(--app-red-text)]">Revocado</span>

// Info / Rol primario (owner, admin, Telegram)
<span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--app-blue-surface)] text-[var(--app-blue-text)]">Owner</span>

// Neutro (viewer, vencido, sin acción)
<span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--app-surface-2)] text-[var(--app-text-2)]">Viewer</span>
```

**Mapeo de colores de Tailwind → tokens semánticos** (para migración o reviews):

| Tailwind (prohibido) | Token correcto |
|---|---|
| `violet-*`, `purple-*` | `--app-blue-{surface/text/border}` |
| `emerald-*`, `teal-*` | `--app-green-{surface/text/border}` |
| `rose-*`, `pink-*` | `--app-red-{surface/text/border}` |
| `sky-*`, `cyan-*` | `--app-blue-{surface/text/border}` |
| `amber-*`, `yellow-*` | `--app-amber-{surface/text/border}` |
| `red-*`, `orange-*` | `--app-red-{surface/text/border}` |
| `green-*`, `lime-*` | `--app-green-{surface/text/border}` |
| `blue-600`, `indigo-*` | `--app-blue-{surface/text/border}` |

Para anillos de badge: `ring-1 ring-[var(--app-{color}-border)]/60`.

**Botones de acción destructiva (danger):**
```tsx
className="bg-[var(--app-red-text)] border-[var(--app-red-text)] text-[var(--app-surface-1)] hover:opacity-90"
```
**Botones de advertencia (activate/schedule):**
```tsx
className="bg-[var(--app-amber-text)] text-white hover:opacity-90"
```
(Amber usa `text-white` — el token `--app-amber-text` es oscuro en light y más oscuro aún en dark, así que blanco tiene mejor contraste.)

### Progress bars

```tsx
<div className="h-1 bg-[var(--app-surface-3)] rounded-full overflow-hidden">
  <div
    className="h-1 rounded-full transition-all duration-300"
    style={{ width: `${pct}%`, background: 'var(--chart-income)' }}
  />
</div>
```

### Tipo de color de monto

```tsx
// Ingreso
<span className="text-[var(--chart-income)] font-semibold tabular-nums">
  +$ 45.000
</span>

// Gasto (usar − U+2212, no guión)
<span className="text-[var(--chart-expense)] font-semibold tabular-nums">
  −$ 12.000
</span>
```

### Tabla estándar

**Contenedor de tabla (receta unificada — usar SIEMPRE la misma):** toda tabla/master-detail va envuelta en una caja idéntica para que Recurrentes, Empresas y Super Admin se lean iguales:

```tsx
<div className="border border-[var(--app-border)] bg-[var(--app-surface-1)] rounded-xl overflow-hidden shadow-[var(--app-shadow-sm)]">
  {/* toolbar opcional (border-b) + <table> + footer de paginación */}
</div>
```

```tsx
<table className="w-full text-sm">
  <thead className="sticky top-0 bg-[var(--app-surface-2)] border-b border-[var(--app-border)] z-10">
    <tr>
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">
        Empresa
      </th>
      <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">
        Saldo
      </th>
    </tr>
  </thead>
  <tbody className="divide-y divide-[var(--app-border)]">
    <tr className="cursor-pointer transition-colors hover:bg-[var(--app-surface-2)]">
      <td className="px-4 py-2.5">...</td>
      <td className="px-3 py-2.5 text-right">...</td>
    </tr>
  </tbody>
</table>
```

### Footer de paginación

```tsx
<div className="border-t border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 flex items-center justify-between shrink-0">
  <span className="text-xs text-[var(--app-text-3)]">
    Mostrando X a Y de Z empresas
  </span>
  <div className="flex items-center gap-1">
    {/* ChevronLeft / page buttons / ChevronRight */}
  </div>
</div>
```

### Layout de ResumenTab

**Estructura de tres zonas (desde arriba):**

1. **KPI row** — `grid grid-cols-2 md:grid-cols-4 gap-4`, primitivo `MetricCard`.
2. **Grid fijo** — siempre visible, no reordenable:
   ```tsx
   <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
     {/* Left: GroupedBarChart "Flujo de los últimos 6 meses" */}
     {/* Right: Actividad reciente — últimos 6 movimientos */}
   </div>
   ```
   Columna izquierda (3fr): `GroupedBarChart` con datos de `buildMonthlyChartData()` de `src/dashboard/summary.ts`.
   Columna derecha (2fr): lista de movimientos `history.slice(0, 6)`, icono semantico por tipo, metadata (empresa · categoría · tiempo).
3. **Secciones drag-to-reorder** (`SECTION_IDS = ['charts', 'proyeccion']`) — desplazables debajo del grid fijo. La sección `actividad` fue eliminada del reorder (vive en el grid fijo) — el localStorage con la key `resumen-section-order` se migra filtrando IDs obsoletos en `loadSectionOrder()`.

## 12. Do's and Don'ts

### Do:
- **Do** tintar todo neutral hacia hue 155-165. Usar tokens `var(--app-*)`, nunca `bg-neutral-*` con opacidad (`/60`, `/90`) porque no son theme-aware.
- **Do** resaltar el borde en hover de todo elemento cliqueable (`hover:border-[var(--app-border-strong)]`).
- **Do** reservar `strong-surface` para la acción primaria y la pestaña activa.
- **Do** usar `tabular-nums` en toda cifra monetaria.
- **Do** mantener light y dark mode como sistemas paralelos: cada token tiene su par.
- **Do** usar bordes completos de 1px en tarjetas y callouts.

### Don't:
- **Don't** iluminar el fondo de un elemento en hover. El feedback es el borde.
- **Don't** usar la estética fintech de manual: azul marino con dorado, gradientes, glassmorphism.
- **Don't** usar la plantilla hero-métrica (número gigante con acento degradado).
- **Don't** usar `#000` ni `#fff`; ni grises planos sin tinte.
- **Don't** usar gradient text (`background-clip: text`).
- **Don't** usar border-left/right de color como franja de acento en tarjetas o callouts.
- **Don't** posicionar acciones (editar/eliminar) flotando por fuera de su elemento con `absolute`; van inline.
- **Don't** usar color para jerarquía. El color comunica semántica financiera, nada más.
