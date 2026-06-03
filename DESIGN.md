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

**Creative North Star: "Petróleo y Terracota"** *(evolución de "Bosque y Niebla" — decisión 2026-05-31)*

Caja Chica es un dashboard financiero para registrar y consultar movimientos en lenguaje natural rioplatense. El sistema visual nace de una idea simple: las finanzas personales no necesitan gritar. La paleta evolucionó a dos modos paralelos con más identidad: **dark "Petróleo Mint"** (fondo petróleo profundo, casi negro verdoso, + acento mint brillante) y **light "Terracota cálida"** (off-white tibio tintado a terracota, nunca blanco puro que quema la vista). El dato financiero se lee sin esfuerzo y sin alarma.

La densidad es media: aire generoso entre grupos conceptuales, filas compactas dentro de las tarjetas. La jerarquía se construye con escala y peso tipográfico, no con color. El color semántico (rojo, verde, ámbar, azul) está reservado exclusivamente para diferenciar tipos de movimiento y estados; nunca decora. El acento de marca (mint) marca la acción primaria y la pestaña activa.

El sistema usa **glass + gradiente con moderación** (decisión 2026-05-31): el efecto vidrio (`backdrop-blur` translúcido) va SOLO en el "chrome" (header/app-bar y barra de pestañas), donde casi no hay texto detrás; las tarjetas de datos son SÓLIDAS para no comprometer contraste ni performance. El gradiente radial sutil va SOLO en el fondo de la app, nunca por tarjeta. Sigue rechazando: glass sobre tarjetas de datos, gradientes pesados detrás de cifras, la plantilla hero-métrica, y la iluminación de fondo en hover (el feedback de hover sigue siendo el resalte de borde).

**Key Characteristics:**
- Dos modos paralelos: dark "Petróleo Mint" y light "Terracota cálida", no una inversión
- Acento de marca mint; color semántico (rojo/verde/ámbar/azul) reservado para significado financiero
- Glass SOLO en chrome (header + tabs); tarjetas de datos sólidas; gradiente solo en el fondo de la app
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

### Paleta aplicada — v2 "Petróleo / Terracota" (2026-05-31)

Reemplaza los valores "Bosque y Niebla" en `index.css` (mismos nombres de token `--app-*`; Fase 1 dialará OKLCH exacto + verificará contraste AA en cifras/tablas). Origen: mockup `mockups/app-full-redesign-v2.html`. Fuente: paletas "Oscura A · Petróleo Mint" + "Clara A · Terracota cálida".

**Dark · Petróleo Mint**
- canvas `#07100D` · surface-1 `#111D18` · surface-2 `#17261F` · surface-3 `#1D3028`
- border `#2A4036` · border-strong `#385348` · text-1 `#F3FBF6` · text-2 `#A9B9B0` · text-3 `#708179`
- marca/ingreso (mint) `#5EE9B5` · gasto (coral) `#F47C72` · pendiente (ámbar) `#F2B84B` · info (azul) `#6DA8FF`

**Light · Terracota cálida** (off-white tibio, NO blanco puro)
- canvas `#F1E8DE` · surface-1 `#FBF6EF` · surface-2 `#EBE0D3` · surface-3 `#E0D3C3`
- border `#D8CABB` · border-strong `#C9B9A6` · text-1 `#211B14` · text-2 `#6E6155` · text-3 `#8A7C6E`
- marca/ingreso `#147E60` · gasto `#C9534C` · pendiente `#B5760F` · info `#2563EB` (acentos un poco más oscuros que en dark, para AA sobre crema)

**Gradiente de fondo** (solo `body`): radial mint suave arriba-izquierda + radial azul tenue arriba-derecha + linear vertical del canvas. Nunca por tarjeta.

### Paletas opcionales (capa `data-palette`) — 2026-06-03

Los dos modos default (Terracota claro / Petróleo oscuro) son la **paleta Predeterminada**. Se sumaron 4 paletas extra **seleccionables por el usuario** en Configuración → Preferencias → Paleta.

**Mecánica (buenas prácticas):** atributo **`data-palette`** en `<html>`, ORTOGONAL al `data-theme` (claro/oscuro). Cada paleta es CSS-only: un bloque `[data-theme="<modo>"][data-palette="<id>"]` en `index.css` que **overridea solo los tokens estructurales + acento** (`--app-canvas`, `--app-surface-1..4`, `--app-border(-strong)`, `--app-text-1..4`, `--app-strong-surface/text`, `--chart-baseline`). Los **tokens semánticos** (verde ingreso / rojo gasto / amber / azul) **se heredan del modo base** para no perder el significado del color. Cada paleta **fija su modo** (elegir una oscura pone `data-theme=dark`). Persistencia: `localStorage` `caja-chica:palette`. Lógica en `src/theme/palettes.ts`; estado en `App.tsx`.

| Paleta | Modo | Acento | Notas |
|---|---|---|---|
| **Predeterminada** | claro/oscuro | mint `#147E60` / `#5EE9B5` | Terracota / Petróleo (default, sin cambios) |
| Arena & Salvia | claro | salvia `#2E7D5B` | prima cálida de la actual |
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

### Inputs / Fields
- **Style:** fondo `surface-1`, borde `border` de 1px, `rounded-md`.
- **Focus:** `focus:ring-2` con el color de texto principal; sin glow de color.
- **Placeholder:** `text-3`.

### Navigation
- **Tab nav:** contenedor plano `surface-2` (glass en v2, ver Regla del Vidrio). Cada pestaña es una tarjeta que levita (ver Regla de la Tarjeta que Levita). Activa: acento de marca/`strong-surface` + `shadow-md`. Inactiva: hover resalta el borde. Móvil: tira de scroll horizontal compacto.

### Header / App-bar (v2, 2026-05-31)
Glass (chrome), sticky. **Sin título de página** (redundante con la sección activa). Layout:
- **Izquierda:** monograma + wordmark "Caja Chica" + CTA primario **Nueva operación** (acento mint, atajo a cargar movimiento).
- **Derecha (en orden):** Buscar (⌘K) · toggle de tema (Claro/Oscuro) · badge de rol (Dueño) · avatar de usuario.

### Selector de hora (componente firma)
Selector tipo alarma para la hora del recordatorio: dos steppers (hora ±1, minutos ±5) con chevrons arriba/abajo y la cifra en `font-mono` en el medio, separados por dos puntos. Compacto, integrado en la fila de configuración.

### Toggle / Switch
Interruptor de permiso/preferencia. `role="switch"` + `aria-checked`, con label `sr-only`. Track `rounded-full`; off `surface-3`, on `strong-surface`. El thumb se desliza con `--duration-quick`. Usado en permisos de miembro (`MiembrosSection`) y toggles de preferencia.

### Dropdown / ActionMenu
Menú de acciones por fila (ej. `PersonasPanel`). Trigger con `aria-haspopup="menu"` + `aria-expanded`; panel `role="menu"`, items `role="menuitem"`. Teclado: flechas ↑/↓ + Escape. Es la ÚNICA excepción a la Regla del Borde en Hover: los ítems apilados usan fondo sutil `surface-2` (el borde no aplica a una lista apilada).

### Toasts (sonner)
Notificaciones efímeras vía `sonner`, ancladas `bottom-center`. Confirmaciones de acción ("Movimiento guardado", "Link copiado"). No bloquean, se apilan, autodesaparecen. Color semántico solo cuando comunica estado real (rojo error / verde éxito).

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

## 7. States (Loading / Empty / Error)

Estados de primera clase, no afterthoughts. Cada vista con datos define los tres.

### Loading
Skeletons tonales (`surface-2`/`surface-3`) que respetan el layout final, no spinners genéricos centrados. Componente: `LoadingStates.tsx`. El skeleton tiene la forma del contenido que viene.

### Empty
Primitive `EmptyState` (title + hint + CTA opcional gated por `canWrite`). Nunca una vista en blanco: título corto, hint de una línea, y si el usuario puede escribir, un CTA al composer. Aplicado en Resumen mensual, Ingresos/Gastos recientes.

### Error
Texto plano y accionable (Nielsen #9): qué pasó + cómo seguir. `role="alert"` para errores de carga/acción, `role="status"` para avisos no urgentes (banner `missing_url`). Nunca el código técnico crudo. Rojo semántico solo en borde/texto del callout, sin relleno alarmante.

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
- **ARIA:** `aria-label` en inputs y botones icon-only; `aria-pressed` en filter chips; `role="tablist"/"tab"` + `aria-selected` en tab nav; `role="switch"`+`aria-checked` en toggles; `role="menu"` en dropdowns; `aria-live`/`role="status"`/`role="alert"` en regiones dinámicas.
- **Foco:** `:focus-visible` con outline 2px tintado (`color-mix` con `--app-text-1`); nunca `outline: none` sin reemplazo.
- **Contraste:** texto crítico ≥ WCAG AA (4.5:1).
- **Teclado:** dropdowns navegables con flechas + Escape; modales con focus-on-mount + Escape; back button del browser nunca se rompe.
- **Movimiento:** `prefers-reduced-motion` respetado (§6).

### Named Rules
**La Regla del Contraste Mínimo.** Texto significativo nunca baja de `text-3`. `text-4` es solo decoración/separadores, jamás contenido legible.

## 11. Iconografía

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

## 10. Do's and Don'ts

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
