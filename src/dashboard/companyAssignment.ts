import type { ExtractedItem } from "../services/api";

export interface PendingCompanyAssignment extends ExtractedItem {
  originalText: string;
}

export function getPendingCompanyAssignment(
  items: ExtractedItem[],
  originalText: string,
): PendingCompanyAssignment | null {
  if (items.length !== 1) return null;

  const [item] = items;
  if (typeof item.empresa === "string" && item.empresa.trim().length > 0) {
    return null;
  }

  return {
    ...item,
    originalText,
  };
}
