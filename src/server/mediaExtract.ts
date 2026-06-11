/**
 * mediaExtract.ts — channel-agnostic media extraction.
 *
 * These extractors take raw bytes (a Buffer/ArrayBuffer already downloaded by
 * whatever channel produced them) and run the Gemini upload → generate → parse
 * pipeline. They know nothing about Telegram, WhatsApp or HTTP — the caller
 * provides the bytes. This is the seam that lets a second channel (WhatsApp)
 * reuse the exact same extraction logic as the Telegram bot and the web upload.
 *
 * The key2 quota fallback is NOT here — it wraps at the channel boundary, where
 * the bytes are already in memory, so a fallback only re-uploads with the
 * second client (see withMediaKeyFallback in geminiWithFallback.ts).
 */

import { createPartFromUri, createUserContent } from "@google/genai";
import {
  RECEIPT_SYSTEM_PROMPT,
  RECEIPT_ITEMS_SYSTEM_PROMPT,
  HANDWRITTEN_SYSTEM_PROMPT,
  MULTI_RECEIPT_SYSTEM_PROMPT,
  CREDIT_CARD_SUMMARY_SYSTEM_PROMPT,
  parsePhotoExtractionResult,
  parseMultiPhotoExtractionResult,
  parseReceiptItemsResult,
  parseCreditCardSummaryResult,
  type PhotoExtractionResult,
  type ReceiptItemsResult,
  type CreditCardExtractionItem,
} from "./gemini.ts";
import { GeminiUnavailableError, isGeminiCapacityError } from "./geminiWithFallback.ts";
import type { PhotoSourceType } from "./validation.ts";

/** Raw bytes accepted by the upload helper (fetch → ArrayBuffer, Node → Buffer). */
export type MediaBytes = ArrayBuffer | Uint8Array;

export interface MediaGenAI {
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

async function uploadBytesToGemini(
  genAI: MediaGenAI,
  bytes: MediaBytes,
  mimeType: string,
  displayName: string,
): Promise<{ name?: string; uri: string; mimeType: string }> {
  const blob = new Blob([bytes], { type: mimeType });
  const uploaded = await genAI.files.upload({ file: blob, config: { mimeType, displayName } });
  if (!uploaded.uri) throw new Error("gemini_media_upload_missing_uri");
  return { name: uploaded.name, uri: uploaded.uri, mimeType: uploaded.mimeType ?? mimeType };
}

async function generateWithCleanup(
  genAI: MediaGenAI,
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

function photoSourceFor(mimeType: string): PhotoSourceType {
  return mimeType === "application/pdf" ? "pdf" : "photo";
}

/**
 * Single-movement extraction: RECEIPT prompt first, permissive HANDWRITTEN
 * retry on parse failure or confidence < 0.5.
 */
export async function extractPhotoFromBytes(
  genAI: MediaGenAI,
  bytes: MediaBytes,
  mimeType: string,
  displayName = "media",
): Promise<{ result: PhotoExtractionResult; sourceType: PhotoSourceType }> {
  const uploaded = await uploadBytesToGemini(genAI, bytes, mimeType, displayName);
  const rawText = await generateWithCleanup(
    genAI,
    [uploaded],
    () => createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), "Extraé los datos del ticket o factura."]),
    RECEIPT_SYSTEM_PROMPT,
  );

  let parsed = parsePhotoExtractionResult(rawText);
  let sourceType = photoSourceFor(mimeType);

  if (!parsed || parsed.confidence < 0.5) {
    const retryUploaded = await uploadBytesToGemini(genAI, bytes, mimeType, displayName);
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

  if (!parsed) throw new Error("gemini_photo_extraction_failed");
  return { result: parsed, sourceType };
}

/**
 * Item-level extraction: merchant metadata plus every line item in one call.
 * Falls back to HANDWRITTEN single-movement shape (items: []) when unreadable.
 */
export async function extractReceiptItemsFromBytes(
  genAI: MediaGenAI,
  bytes: MediaBytes,
  mimeType: string,
  displayName = "media",
): Promise<{ result: ReceiptItemsResult; sourceType: PhotoSourceType }> {
  const uploaded = await uploadBytesToGemini(genAI, bytes, mimeType, displayName);
  const rawText = await generateWithCleanup(
    genAI,
    [uploaded],
    () => createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), "Extraé los datos del comercio y cada renglón del ticket."]),
    RECEIPT_ITEMS_SYSTEM_PROMPT,
  );

  const parsed = parseReceiptItemsResult(rawText);
  const sourceType = photoSourceFor(mimeType);

  if (parsed && parsed.confidence >= 0.5 && (parsed.items.length > 0 || parsed.total !== null)) {
    return { result: parsed, sourceType };
  }

  const retryUploaded = await uploadBytesToGemini(genAI, bytes, mimeType, displayName);
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
  throw new Error("gemini_photo_extraction_failed");
}

/** Statement (credit card / bank) extraction: one call, every transaction. */
export async function extractStatementFromBytes(
  genAI: MediaGenAI,
  bytes: MediaBytes,
  mimeType: string,
  displayName = "media",
): Promise<CreditCardExtractionItem[]> {
  const uploaded = await uploadBytesToGemini(genAI, bytes, mimeType, displayName);
  const rawText = await generateWithCleanup(
    genAI,
    [uploaded],
    () => createUserContent([createPartFromUri(uploaded.uri, uploaded.mimeType), "Extraé cada transacción individual de este resumen."]),
    CREDIT_CARD_SUMMARY_SYSTEM_PROMPT,
  );
  const items = parseCreditCardSummaryResult(rawText);
  if (!items) throw new Error("gemini_statement_extraction_failed");
  return items;
}

/** Album / media-group extraction: many images in one MULTI_RECEIPT call. */
export async function extractMultipleFromBytes(
  genAI: MediaGenAI,
  files: Array<{ bytes: MediaBytes; mimeType: string; displayName?: string }>,
): Promise<PhotoExtractionResult[]> {
  const uploadedFiles: Array<{ name?: string; uri: string; mimeType: string }> = [];
  try {
    for (const file of files) {
      uploadedFiles.push(
        await uploadBytesToGemini(genAI, file.bytes, file.mimeType, file.displayName ?? "media"),
      );
    }
  } catch (err) {
    for (const f of uploadedFiles) {
      if (f.name) {
        genAI.files.delete({ name: f.name }).catch((e) => {
          console.warn("Gemini media file cleanup error (partial upload):", e);
        });
      }
    }
    throw err;
  }

  const parts = uploadedFiles.map((u) => createPartFromUri(u.uri, u.mimeType));
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
