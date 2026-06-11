/**
 * imageExtract.ts — web upload adapter for media extraction.
 *
 * The web hands a Buffer straight to the channel-agnostic item-level extractor
 * in mediaExtract.ts (no download step). The key2 quota fallback wraps here:
 * the Buffer is in memory, so a fallback only re-uploads with the second client.
 */

import { extractReceiptItemsFromBytes, type MediaGenAI } from "./mediaExtract.ts";
import { withMediaKeyFallback } from "./geminiWithFallback.ts";
import type { ReceiptItemsResult } from "./gemini.ts";
import type { PhotoSourceType } from "./validation.ts";

export const WEB_IMAGE_MIME_ALLOWLIST = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/** 7 MB decoded limit — keeps payload size reasonable for JSON transport */
export const WEB_IMAGE_MAX_BYTES = 7 * 1024 * 1024;

export interface ExtractFromBufferArgs {
  genAI: MediaGenAI;
  /** Second API key client — the Buffer is re-uploaded with it on 429/503. */
  genAI2?: MediaGenAI | null;
  imageBuffer: Buffer;
  mimeType: string;
  displayName?: string;
}

/**
 * Item-level web extraction: merchant metadata plus every line item, with the
 * permissive HANDWRITTEN fallback. Shared with the bot via mediaExtract — same
 * prompts, same fallback profile. PDFs supported (Gemini Files API handles them
 * like images).
 */
export async function extractItemsFromBuffer(
  args: ExtractFromBufferArgs,
): Promise<{ result: ReceiptItemsResult; sourceType: PhotoSourceType }> {
  const name = args.displayName ?? "web-upload";
  return withMediaKeyFallback(args.genAI, args.genAI2, (client) =>
    extractReceiptItemsFromBytes(client, args.imageBuffer, args.mimeType, name),
  );
}
