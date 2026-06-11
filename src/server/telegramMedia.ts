/**
 * telegramMedia.ts — Telegram channel adapter for media extraction.
 *
 * Responsibility is now narrow: download bytes from the Telegram file API, then
 * hand them to the channel-agnostic extractors in mediaExtract.ts. The key2
 * quota fallback wraps here (the bytes are downloaded once; a fallback only
 * re-uploads with the second client). All extraction logic lives in
 * mediaExtract.ts so WhatsApp/web can reuse it.
 */

import {
  extractPhotoFromBytes,
  extractReceiptItemsFromBytes,
  extractStatementFromBytes,
  extractMultipleFromBytes,
  type MediaGenAI,
} from "./mediaExtract.ts";
import { withMediaKeyFallback } from "./geminiWithFallback.ts";
import type { PhotoExtractionResult, ReceiptItemsResult, CreditCardExtractionItem } from "./gemini.ts";
import type { PhotoSourceType } from "./validation.ts";

/** Re-exported so existing imports keep working; this is the generic media client shape. */
export type TelegramMediaGenAI = MediaGenAI;

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

export interface ExtractFromPhotoArgs {
  genAI: TelegramMediaGenAI;
  /** Second API key client — on 429/503 the already-downloaded bytes are re-uploaded with it. */
  genAI2?: TelegramMediaGenAI | null;
  botToken: string;
  filePath: string;
  mimeType: string;
  displayName?: string;
  fetchImpl?: typeof fetch;
}

export interface ExtractFromMultiplePhotosArgs {
  genAI: TelegramMediaGenAI;
  genAI2?: TelegramMediaGenAI | null;
  botToken: string;
  files: Array<{ filePath: string; mimeType: string; displayName?: string }>;
  fetchImpl?: typeof fetch;
}

function buildTelegramFileUrl(botToken: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

function displayNameFor(filePath: string, displayName?: string): string {
  return displayName ?? filePath.split("/").pop() ?? "telegram-media";
}

/** Download raw bytes from the Telegram file API (channel-specific step). */
async function downloadTelegramBytes(
  botToken: string,
  filePath: string,
  fetchImpl: typeof fetch,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(buildTelegramFileUrl(botToken, filePath));
  if (!response.ok) {
    throw new Error(`telegram_media_download_failed:${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`telegram_media_too_large:${arrayBuffer.byteLength}`);
  }
  return arrayBuffer;
}

export async function extractFromPhoto(
  args: ExtractFromPhotoArgs,
): Promise<{ result: PhotoExtractionResult; sourceType: PhotoSourceType }> {
  const bytes = await downloadTelegramBytes(args.botToken, args.filePath, args.fetchImpl ?? fetch);
  const name = displayNameFor(args.filePath, args.displayName);
  return withMediaKeyFallback(args.genAI, args.genAI2, (client) =>
    extractPhotoFromBytes(client, bytes, args.mimeType, name),
  );
}

export async function extractReceiptWithItems(
  args: ExtractFromPhotoArgs,
): Promise<{ result: ReceiptItemsResult; sourceType: PhotoSourceType }> {
  const bytes = await downloadTelegramBytes(args.botToken, args.filePath, args.fetchImpl ?? fetch);
  const name = displayNameFor(args.filePath, args.displayName);
  return withMediaKeyFallback(args.genAI, args.genAI2, (client) =>
    extractReceiptItemsFromBytes(client, bytes, args.mimeType, name),
  );
}

export async function extractFromStatement(
  args: ExtractFromPhotoArgs,
): Promise<CreditCardExtractionItem[]> {
  const bytes = await downloadTelegramBytes(args.botToken, args.filePath, args.fetchImpl ?? fetch);
  const name = displayNameFor(args.filePath, args.displayName);
  return withMediaKeyFallback(args.genAI, args.genAI2, (client) =>
    extractStatementFromBytes(client, bytes, args.mimeType, name),
  );
}

export async function extractFromMultiplePhotos(
  args: ExtractFromMultiplePhotosArgs,
): Promise<PhotoExtractionResult[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const downloaded = await Promise.all(
    args.files.map(async (file) => ({
      bytes: await downloadTelegramBytes(args.botToken, file.filePath, fetchImpl),
      mimeType: file.mimeType,
      displayName: displayNameFor(file.filePath, file.displayName),
    })),
  );
  return withMediaKeyFallback(args.genAI, args.genAI2, (client) =>
    extractMultipleFromBytes(client, downloaded),
  );
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
