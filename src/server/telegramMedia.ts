import { createPartFromUri, createUserContent } from "@google/genai";
import {
  RECEIPT_SYSTEM_PROMPT,
  RECEIPT_ITEMS_SYSTEM_PROMPT,
  HANDWRITTEN_SYSTEM_PROMPT,
  MULTI_RECEIPT_SYSTEM_PROMPT,
  parsePhotoExtractionResult,
  parseMultiPhotoExtractionResult,
  parseReceiptItemsResult,
  type PhotoExtractionResult,
  type ReceiptItemsResult,
} from "./gemini.ts";
import { GeminiUnavailableError, isGeminiCapacityError } from "./geminiWithFallback.ts";
import type { PhotoSourceType } from "./validation.ts";

export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  ...SUPPORTED_IMAGE_MIME_TYPES,
  "application/pdf",
]);

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export interface TelegramMediaGenAI {
  files: {
    upload(params: {
      file: Blob;
      config?: { mimeType?: string; displayName?: string };
    }): Promise<{ name?: string; uri?: string; mimeType?: string }>;
    delete(params: { name: string }): Promise<unknown>;
  };
  models: {
    generateContent(params: {
      model: string;
      contents: unknown;
      config?: { systemInstruction?: string };
    }): Promise<{
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>;
  };
}

export interface ExtractFromPhotoArgs {
  genAI: TelegramMediaGenAI;
  botToken: string;
  filePath: string;
  mimeType: string;
  displayName?: string;
  fetchImpl?: typeof fetch;
}

export interface ExtractFromMultiplePhotosArgs {
  genAI: TelegramMediaGenAI;
  botToken: string;
  files: Array<{ filePath: string; mimeType: string; displayName?: string }>;
  fetchImpl?: typeof fetch;
}

function buildTelegramFileUrl(botToken: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

async function downloadAndUpload(
  genAI: TelegramMediaGenAI,
  botToken: string,
  filePath: string,
  mimeType: string,
  displayName: string,
  fetchImpl: typeof fetch,
): Promise<{ name?: string; uri: string; mimeType: string }> {
  const response = await fetchImpl(buildTelegramFileUrl(botToken, filePath));
  if (!response.ok) {
    throw new Error(`telegram_media_download_failed:${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`telegram_media_too_large:${arrayBuffer.byteLength}`);
  }
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const uploaded = await genAI.files.upload({
    file: blob,
    config: { mimeType, displayName },
  });
  if (!uploaded.uri) throw new Error("gemini_media_upload_missing_uri");
  return { name: uploaded.name, uri: uploaded.uri, mimeType: uploaded.mimeType ?? mimeType };
}

async function generateWithCleanup(
  genAI: TelegramMediaGenAI,
  uploadedFiles: Array<{ name?: string }>,
  contentsBuilder: () => unknown,
  systemInstruction: string,
): Promise<string> {
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentsBuilder(),
      config: { systemInstruction },
    });
    return (result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch (err) {
    if (isGeminiCapacityError(err)) throw new GeminiUnavailableError();
    throw err;
  } finally {
    for (const f of uploadedFiles) {
      if (f.name) {
        genAI.files.delete({ name: f.name }).catch((err) => {
          console.warn("Gemini media file cleanup error:", err);
        });
      }
    }
  }
}

export async function extractFromPhoto({
  genAI,
  botToken,
  filePath,
  mimeType,
  displayName,
  fetchImpl = fetch,
}: ExtractFromPhotoArgs): Promise<{ result: PhotoExtractionResult; sourceType: PhotoSourceType }> {
  const uploaded = await downloadAndUpload(
    genAI,
    botToken,
    filePath,
    mimeType,
    displayName ?? filePath.split("/").pop() ?? "telegram-media",
    fetchImpl,
  );

  const rawText = await generateWithCleanup(
    genAI,
    [uploaded],
    () => createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), "Extraé los datos del ticket o factura."]),
    RECEIPT_SYSTEM_PROMPT,
  );

  let parsed = parsePhotoExtractionResult(rawText);
  let sourceType: PhotoSourceType = mimeType === "application/pdf" ? "pdf" : "photo";

  if (!parsed || parsed.confidence < 0.5) {
    const retryUploaded = await downloadAndUpload(
      genAI,
      botToken,
      filePath,
      mimeType,
      displayName ?? filePath.split("/").pop() ?? "telegram-media",
      fetchImpl,
    );
    const retryText = await generateWithCleanup(
      genAI,
      [retryUploaded],
      () => createUserContent([createPartFromUri(retryUploaded.uri, retryUploaded.mimeType), "Extraé la información financiera de esta imagen."]),
      HANDWRITTEN_SYSTEM_PROMPT,
    );
    const retryParsed = parsePhotoExtractionResult(retryText);
    if (retryParsed) {
      parsed = retryParsed;
      sourceType = "handwritten";
    }
  }

  if (!parsed) {
    throw new Error("gemini_photo_extraction_failed");
  }

  return { result: parsed, sourceType };
}

/**
 * Item-level receipt extraction: pulls the merchant metadata plus every line
 * item in a single Gemini call. When the receipt is unreadable (parse failure
 * or confidence < 0.5) it falls back to the permissive HANDWRITTEN prompt and
 * returns a single-movement shape (items: []), mirroring extractFromPhoto's
 * robustness profile so the common case stays a single model call.
 */
export async function extractReceiptWithItems({
  genAI,
  botToken,
  filePath,
  mimeType,
  displayName,
  fetchImpl = fetch,
}: ExtractFromPhotoArgs): Promise<{ result: ReceiptItemsResult; sourceType: PhotoSourceType }> {
  const name = displayName ?? filePath.split("/").pop() ?? "telegram-media";
  const uploaded = await downloadAndUpload(genAI, botToken, filePath, mimeType, name, fetchImpl);

  const rawText = await generateWithCleanup(
    genAI,
    [uploaded],
    () => createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), "Extraé los datos del comercio y cada renglón del ticket."]),
    RECEIPT_ITEMS_SYSTEM_PROMPT,
  );

  const parsed = parseReceiptItemsResult(rawText);
  const sourceType: PhotoSourceType = mimeType === "application/pdf" ? "pdf" : "photo";

  if (parsed && parsed.confidence >= 0.5 && (parsed.items.length > 0 || parsed.total !== null)) {
    return { result: parsed, sourceType };
  }

  // Fallback: permissive handwritten single-movement extraction.
  const retryUploaded = await downloadAndUpload(genAI, botToken, filePath, mimeType, name, fetchImpl);
  const retryText = await generateWithCleanup(
    genAI,
    [retryUploaded],
    () => createUserContent([createPartFromUri(retryUploaded.uri, retryUploaded.mimeType), "Extraé la información financiera de esta imagen."]),
    HANDWRITTEN_SYSTEM_PROMPT,
  );
  const retryParsed = parsePhotoExtractionResult(retryText);
  if (retryParsed) {
    return {
      result: {
        empresa: retryParsed.empresa,
        cuit: retryParsed.cuit,
        moneda: retryParsed.moneda,
        fecha: retryParsed.fecha,
        total: retryParsed.monto,
        confidence: retryParsed.confidence,
        items: [],
      },
      sourceType: "handwritten",
    };
  }

  if (parsed) return { result: parsed, sourceType };
  throw new Error("gemini_photo_extraction_failed");
}

export async function extractFromMultiplePhotos({
  genAI,
  botToken,
  files,
  fetchImpl = fetch,
}: ExtractFromMultiplePhotosArgs): Promise<PhotoExtractionResult[]> {
  const uploadedFiles: Array<{ name?: string; uri: string; mimeType: string }> = [];

  try {
    for (const file of files) {
      const uploaded = await downloadAndUpload(
        genAI,
        botToken,
        file.filePath,
        file.mimeType,
        file.displayName ?? file.filePath.split("/").pop() ?? "telegram-media",
        fetchImpl,
      );
      uploadedFiles.push(uploaded);
    }
  } catch (err) {
    // Clean up any files already uploaded before re-throwing
    for (const f of uploadedFiles) {
      if (f.name) {
        genAI.files.delete({ name: f.name }).catch((e) => {
          console.warn("Gemini media file cleanup error (partial upload):", e);
        });
      }
    }
    throw err;
  }

  const parts = uploadedFiles.flatMap((u) => [
    createPartFromUri(u.uri, u.mimeType),
  ]);

  const rawText = await generateWithCleanup(
    genAI,
    uploadedFiles,
    () => createUserContent([...parts, `Extraé los datos de los ${files.length} tickets o facturas.`]),
    MULTI_RECEIPT_SYSTEM_PROMPT,
  );

  const results = parseMultiPhotoExtractionResult(rawText);
  if (!results || results.length === 0) {
    throw new Error("gemini_multi_photo_extraction_failed");
  }
  return results;
}

export function inferMediaMimeType(args: {
  mimeType?: string | null;
  filePath?: string | null;
  isDocument: boolean;
}): string | null {
  if (args.mimeType) {
    const set = args.isDocument ? SUPPORTED_DOCUMENT_MIME_TYPES : SUPPORTED_IMAGE_MIME_TYPES;
    if (set.has(args.mimeType)) return args.mimeType;
  }
  const ext = args.filePath?.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
  };
  return (ext && byExt[ext]) ? byExt[ext] : null;
}
