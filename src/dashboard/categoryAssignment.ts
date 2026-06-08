import type { ExtractedItem, Categoria } from "../services/api";

export interface PendingCategoryAssignment extends ExtractedItem {
  originalText: string;
  /** The category Gemini suggested that does not exist yet. */
  suggested: string;
}

// Returns a pending assignment when the extraction suggested a category that
// does NOT exist yet for the dashboard, so the composer can ask the user
// whether to create it or fall back to "Otros".
// No prompt when: multiple items, empty category, "Otros", or it already exists.
export function getPendingCategoryAssignment(
  items: ExtractedItem[],
  originalText: string,
  existing: Categoria[],
): PendingCategoryAssignment | null {
  if (items.length !== 1) return null;

  const [item] = items;
  const cat = typeof item.categoria === "string" ? item.categoria.trim() : "";
  if (!cat || cat.toLowerCase() === "otros") return null;

  const exists = existing.some(
    (c) => c.nombre.trim().toLowerCase() === cat.toLowerCase(),
  );
  if (exists) return null;

  return { ...item, originalText, suggested: cat };
}
