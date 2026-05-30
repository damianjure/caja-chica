/**
 * POST /api/extract-image — web image extraction endpoint.
 *
 * Accepts: { image: <base64>, mimeType: string }
 * Returns: PendingExtractionData (same shape as bot photo review)
 *
 * Auth: requireSession
 * Rate limit: tierStrict (same as /api/extract)
 * Size cap: 7 MB decoded
 * Mime allowlist: image/jpeg, image/png, image/webp, image/gif
 *   PDF is excluded — browser file pickers accept images; PDF flow
 *   is not in scope for web upload (bot uses Gemini Files API for PDFs).
 */

import express, { type RequestHandler } from "express";
import type { GenAILike } from "../contracts.ts";
import { GeminiUnavailableError } from "../geminiWithFallback.ts";
import { extractFromBuffer, WEB_IMAGE_MIME_ALLOWLIST, WEB_IMAGE_MAX_BYTES } from "../imageExtract.ts";

// The decoded cap is WEB_IMAGE_MAX_BYTES (7MB) — the real gate, enforced after decode.
// The JSON body limit only needs to exceed base64(7MB)≈9.5MB plus JSON overhead so a
// valid image is parsed and then size-checked at the decoded level. Only authenticated,
// rate-limited (tierStrict) callers ever reach this parser (see middleware order below).
const IMAGE_BODY_LIMIT = "12mb";

export interface ImageExtractRouterDeps {
  genAI: GenAILike;
  requireSession: RequestHandler;
  tierStrict: RequestHandler;
}

export function createImageExtractRouter({ genAI, requireSession, tierStrict }: ImageExtractRouterDeps) {
  const router = express.Router();

  // Order matters: auth + strict rate-limit run BEFORE body parsing, so an
  // unauthenticated or over-rate caller is rejected before the large upload is
  // buffered/decoded (pre-auth memory-DoS guard). The global express.json() skips
  // this path (see app.ts), so this router-level parser with the higher limit is
  // the only one that parses the image body.
  router.post("/api/extract-image", requireSession, tierStrict, express.json({ limit: IMAGE_BODY_LIMIT }), async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;

      // Validate presence
      if (typeof body.image !== "string" || !body.image) {
        return res.status(400).json({ error: "invalid_request" });
      }
      const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
      if (!mimeType) {
        return res.status(400).json({ error: "invalid_request" });
      }

      // Validate mime BEFORE decode (cheap check)
      if (!WEB_IMAGE_MIME_ALLOWLIST.has(mimeType)) {
        return res.status(400).json({ error: "unsupported_mime_type" });
      }

      // Decode base64 → Buffer
      let imageBuffer: Buffer;
      try {
        imageBuffer = Buffer.from(body.image, "base64");
      } catch {
        return res.status(400).json({ error: "invalid_request" });
      }

      // Enforce size cap AFTER decode (accurate byte count)
      if (imageBuffer.byteLength > WEB_IMAGE_MAX_BYTES) {
        return res.status(400).json({ error: "image_too_large" });
      }

      const { result, sourceType } = await extractFromBuffer({
        genAI: genAI as any,
        imageBuffer,
        mimeType,
      });

      // Return PendingExtractionData shape
      return res.json({
        monto: result.monto,
        moneda: result.moneda,
        tipo: result.tipo,
        empresa: result.empresa,
        cuit: result.cuit,
        categoria: result.categoria,
        descripcion: result.descripcion,
        fecha: result.fecha,
        confidence: result.confidence,
        sourceType,
      });
    } catch (err) {
      if (err instanceof GeminiUnavailableError) {
        return res.status(503).json({ error: "ai_unavailable" });
      }
      console.error("[POST /api/extract-image]", err);
      return res.status(500).json({ error: "failed_to_process" });
    }
  });

  return router;
}
