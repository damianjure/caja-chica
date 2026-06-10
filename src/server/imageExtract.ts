/**
 * imageExtract.ts — shared image extraction pipeline for web upload.
 *
 * extractFromBuffer works like the bot's extractFromPhoto but accepts a
 * Buffer directly (no Telegram download step). Same RECEIPT→HANDWRITTEN
 * fallback logic. Media does NOT retry with a fallback key — Files API
 * uploads are scoped to the primary key.
 */

import { createPartFromUri, createUserContent } from "@google/genai";
import {
  RECEIPT_ITEMS_SYSTEM_PROMPT,
  HANDWRITTEN_SYSTEM_PROMPT,
  parsePhotoExtractionResult,
  parseReceiptItemsResult,
  type ReceiptItemsResult,
} from "./gemini.ts";
import { GeminiUnavailableError, isGeminiCapacityError } from "./geminiWithFallback.ts";
import type { TelegramMediaGenAI } from "./telegramMedia.ts";
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
  genAI: TelegramMediaGenAI;
  imageBuffer: Buffer;
  mimeType: string;
  displayName?: string;
}

async function uploadBufferToGemini(
  genAI: TelegramMediaGenAI,
  imageBuffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ name?: string; uri: string; mimeType: string }> {
  const blob = new Blob([imageBuffer], { type: mimeType });
  const uploaded = await genAI.files.upload({
    file: blob,
    config: { mimeType, displayName },
  });
  if (!uploaded.uri) throw new Error("gemini_web_upload_missing_uri");
  return { name: uploaded.name, uri: uploaded.uri, mimeType: uploaded.mimeType ?? mimeType };
}

async function generateAndCleanup(
  genAI: TelegramMediaGenAI,
  uploaded: { name?: string; uri: string; mimeType: string },
  systemInstruction: string,
  promptText: string,
): Promise<string> {
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), promptText]),
      config: { systemInstruction },
    });
    return (result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch (err) {
    if (isGeminiCapacityError(err)) throw new GeminiUnavailableError();
    throw err;
  } finally {
    if (uploaded.name) {
      genAI.files.delete({ name: uploaded.name }).catch((e) => {
        console.warn("Gemini web image cleanup error:", e);
      });
    }
  }
}

/**
 * Item-level web extraction: pulls merchant metadata plus every line item in a
 * single Gemini call. Mirror of the bot's extractReceiptWithItems but from a
 * Buffer (no Telegram download). Falls back to the permissive HANDWRITTEN
 * prompt when the receipt is unreadable (parse failure or confidence < 0.5),
 * returning a single-movement shape (items: []) so the common case stays one
 * model call. PDFs are supported — Gemini Files API handles them like images.
 */
export async function extractItemsFromBuffer({
  genAI,
  imageBuffer,
  mimeType,
  displayName = "web-upload",
}: ExtractFromBufferArgs): Promise<{ result: ReceiptItemsResult; sourceType: PhotoSourceType }> {
  const uploaded = await uploadBufferToGemini(genAI, imageBuffer, mimeType, displayName);
  const rawText = await generateAndCleanup(
    genAI,
    uploaded,
    RECEIPT_ITEMS_SYSTEM_PROMPT,
    "Extraé los datos del comercio y cada renglón del ticket.",
  );

  const parsed = parseReceiptItemsResult(rawText);
  const sourceType: PhotoSourceType = mimeType === "application/pdf" ? "pdf" : "photo";

  if (parsed && parsed.confidence >= 0.5 && (parsed.items.length > 0 || parsed.total !== null)) {
    return { result: parsed, sourceType };
  }

  // Fallback: permissive handwritten single-movement extraction.
  const retryUploaded = await uploadBufferToGemini(genAI, imageBuffer, mimeType, displayName);
  const retryText = await generateAndCleanup(
    genAI,
    retryUploaded,
    HANDWRITTEN_SYSTEM_PROMPT,
    "Extraé la información financiera de esta imagen.",
  );
  const retryParsed = parsePhotoExtractionResult(retryText);
  if (retryParsed) {
    return {
      result: {
        documentKind: "receipt",
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
  throw new Error("gemini_web_extraction_failed");
}
