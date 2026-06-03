import type { ThemeMode } from "../components/ThemeToggle";

/** Paleta opcional sobre el modo claro/oscuro. id "" = predeterminada (Terracota/Petróleo). */
export interface Palette {
  id: string;
  label: string;
  mode: ThemeMode;
}

export const PALETTES: Palette[] = [
  { id: "arena", label: "Arena & Salvia", mode: "light" },
  { id: "marfil", label: "Marfil & Terracota", mode: "light" },
  { id: "medianoche", label: "Medianoche & Violeta", mode: "dark" },
  { id: "carbon", label: "Carbón & Ámbar", mode: "dark" },
];

export const PALETTE_STORAGE_KEY = "caja-chica:palette";

export function readPalette(): string {
  try {
    const v = window.localStorage.getItem(PALETTE_STORAGE_KEY) ?? "";
    return PALETTES.some((p) => p.id === v) ? v : "";
  } catch {
    return "";
  }
}

export function applyPalette(id: string): void {
  if (typeof document === "undefined") return;
  if (id) document.documentElement.dataset.palette = id;
  else delete document.documentElement.dataset.palette;
}
