/**
 * useImageExtract — handles image upload flow for the web composer.
 *
 * Reads a File as base64, POSTs to /api/extract-image, and surfaces
 * the result (ImageExtractionResult) for the review modal.
 * Mirrors the useComposer error handling for 503 (AI unavailable).
 */

import { useState } from "react";
import { api, ApiError, type ImageItemsExtractionResult } from "../../services/api";

export const WEB_IMAGE_MIME_ALLOWLIST = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export const WEB_IMAGE_MAX_BYTES = 7 * 1024 * 1024;

export interface UseImageExtractResult {
  isExtracting: boolean;
  extractError: string | null;
  extracted: ImageItemsExtractionResult | null;
  startExtract: (file: File) => Promise<void>;
  clearExtracted: () => void;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<b64>" — strip the prefix
      const b64 = result.split(",")[1];
      if (!b64) reject(new Error("empty_file"));
      else resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useImageExtract(): UseImageExtractResult {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ImageItemsExtractionResult | null>(null);

  const startExtract = async (file: File) => {
    setExtractError(null);

    if (!WEB_IMAGE_MIME_ALLOWLIST.has(file.type)) {
      setExtractError("Solo se aceptan imágenes (JPEG, PNG, WEBP, GIF) o PDF.");
      return;
    }
    if (file.size > WEB_IMAGE_MAX_BYTES) {
      setExtractError("El archivo es demasiado grande (máximo 7 MB).");
      return;
    }

    setIsExtracting(true);
    try {
      const b64 = await readFileAsBase64(file);
      const result = await api.extractImage(b64, file.type);
      setExtracted(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setExtractError("La IA no está disponible ahora mismo. Intentá en unos minutos.");
      } else if (err instanceof ApiError && err.status === 400) {
        setExtractError("Archivo inválido o no soportado.");
      } else {
        setExtractError("Error al procesar la imagen. Intentá de nuevo.");
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const clearExtracted = () => {
    setExtracted(null);
    setExtractError(null);
  };

  return { isExtracting, extractError, extracted, startExtract, clearExtracted };
}
