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

## 1. Overview

**Creative North Star: "Bosque y Niebla"**

Caja Chica es un dashboard financiero para registrar y consultar movimientos en lenguaje natural rioplatense. El sistema visual nace de una idea simple: las finanzas personales no necesitan gritar. La paleta "Bosque & Niebla" usa neutrales sage tintados hacia un verde grisáceo apagado (hue 155-165), una niebla calma sobre la que el dato financiero se lee sin esfuerzo y sin alarma.

La densidad es media: aire generoso entre grupos conceptuales, filas compactas dentro de las tarjetas. La jerarquía se construye con escala y peso tipográfico, no con color. El color semántico (rojo, verde, ámbar, azul) está reservado exclusivamente para diferenciar tipos de movimiento y estados; nunca decora. La superficie fuerte (`strong-surface`, casi negra tintada) marca la acción primaria y la pestaña activa, y solo eso.

El sistema rechaza explícitamente la estética "fintech" de manual: nada de azul marino con dorado, nada de gradientes, nada de glassmorphism, nada de la plantilla hero-métrica (número gigante, label chico, acento degradado). También rechaza la iluminación de fondo en hover: los elementos cliqueables responden resaltando su borde, no encendiéndose.

**Key Characteristics:**
- Neutrales OKLCH tintados hacia sage (hue 155-165), nunca `#000` ni `#fff`
- Light y dark mode como sistemas paralelos completos, no una inversión
- Jerarquía por escala y peso; color reservado para semántica
- Hover = resalte de borde, nunca relleno de fondo
- Tipografía única (Inter Variable, self-hosted)

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

**La Regla de la Superficie Fuerte.** La tinta oscura (`strong-surface`) aparece solo en la acción primaria y la pestaña activa. Su rareza es lo que la hace legible como "lo importante".

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

### Named Rules
**La Regla de la Tarjeta que Levita.** El contenedor de la navegación por pestañas es plano (`surface-2`, sin sombra). Las tarjetas individuales dentro de él levitan: `surface-1` más claro, más `shadow-sm`. El contraste de capa, no el brillo, es lo que las despega.

**La Regla del Borde en Hover.** Ningún elemento cliqueable se ilumina (cambia su fondo) en hover. El feedback de hover es siempre el resalte del borde a `border-strong`. La iluminación de fondo está prohibida en elementos tipo botón, tarjeta o chip. (Excepción: los ítems apilados de un menú desplegable usan un fondo sutil `surface-2`, porque el borde no aplica a una lista apilada.)

## 5. Components

### Buttons
- **Shape:** esquinas suaves (`rounded-md`, 0.5rem) para botones; `rounded-lg`/`rounded-xl` para elementos tipo tarjeta cliqueable.
- **Primary:** fondo `strong-surface`, texto `strong-text`, borde del mismo color que el fondo, `shadow-md`. Padding `0.625rem 1.5rem`.
- **Ghost:** fondo `surface-1`, borde `border`, texto `text-2`, `shadow-sm`.
- **Danger:** outline rojo (`border-red-200`, `bg-red-50`, `text-red-600`); reservado para acciones destructivas.
- **Hover / Focus:** el borde pasa a `border-strong` (o al tono fuerte del color en botones semánticos). Sin cambio de fondo. `active:scale-[0.97]` da el feedback de click. Focus visible: outline de 2px.

### Chips
- **Filtro de empresa:** pill (`rounded-full`). No seleccionado: `surface-1` con borde, hover resalta el borde. Seleccionado: `strong-surface` con texto invertido. Las acciones de editar/eliminar aparecen inline dentro del pill seleccionado, nunca flotando por fuera.
- **Categoría:** pill `surface-3` con la acción de eliminar inline (ícono chico que enrojece en hover).
- **Badge de estado:** pill con color semántico de baja saturación, variante dark con `bg-{color}-500/15 + text-{color}-200`.

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

### Inputs / Fields
- **Style:** fondo `surface-1`, borde `border` de 1px, `rounded-md`.
- **Focus:** `focus:ring-2` con el color de texto principal; sin glow de color.
- **Placeholder:** `text-3`.

### Navigation
- **Tab nav:** contenedor plano `surface-2`. Cada pestaña es una tarjeta que levita (ver Regla de la Tarjeta que Levita). Activa: `strong-surface` + `shadow-md`. Inactiva: `surface-1` + `shadow-sm`, hover resalta el borde. Móvil: tira de scroll horizontal compacto.

### Selector de hora (componente firma)
Selector tipo alarma para la hora del recordatorio: dos steppers (hora ±1, minutos ±5) con chevrons arriba/abajo y la cifra en `font-mono` en el medio, separados por dos puntos. Compacto, integrado en la fila de configuración.

## 6. Do's and Don'ts

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
