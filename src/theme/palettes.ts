import type { ThemeMode } from "../components/ThemeToggle";

/** Una paleta por modo. id "" = predeterminada (Terracota en claro / Petróleo en oscuro). */
export interface PaletteOption {
  id: string;
  label: string;
  swatch: string;
}

export const LIGHT_PALETTES: PaletteOption[] = [
  { id: "", label: "Terracota", swatch: "#147E60" },
  { id: "niebla", label: "Niebla & Azul Tinta", swatch: "#1F6F78" },
  { id: "marfil", label: "Marfil & Terracota", swatch: "#C2541F" },
];

export const DARK_PALETTES: PaletteOption[] = [
  { id: "", label: "Petróleo", swatch: "#5EE9B5" },
  { id: "medianoche", label: "Medianoche & Violeta", swatch: "#8C6BF0" },
  { id: "carbon", label: "Carbón & Ámbar", swatch: "#E0922F" },
];

const LIGHT_KEY = "caja-chica:palette-light";
const DARK_KEY = "caja-chica:palette-dark";

function read(key: string, valid: PaletteOption[]): string {
  try {
    const v = window.localStorage.getItem(key) ?? "";
    return valid.some((p) => p.id === v) ? v : "";
  } catch {
    return "";
  }
}

export const readLightPalette = (): string => read(LIGHT_KEY, LIGHT_PALETTES);
export const readDarkPalette = (): string => read(DARK_KEY, DARK_PALETTES);

export function storeLightPalette(id: string): void {
  try { window.localStorage.setItem(LIGHT_KEY, id); } catch { /* ignore */ }
}
export function storeDarkPalette(id: string): void {
  try { window.localStorage.setItem(DARK_KEY, id); } catch { /* ignore */ }
}

/** Aplica en <html> la paleta que corresponde al modo activo. */
export function applyPalette(mode: ThemeMode, lightId: string, darkId: string): void {
  if (typeof document === "undefined") return;
  const id = mode === "light" ? lightId : darkId;
  if (id) document.documentElement.dataset.palette = id;
  else delete document.documentElement.dataset.palette;
}
