## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2026-06-28 - Prevent Timing Attacks on Token Verification
**Vulnerability:** The application was using plain string equality (`===`) to compare the provided `X-Admin-Token` with the configured `adminApiToken` in `src/server/app.ts`.
**Learning:** Plain string comparison exits early on the first non-matching character. This exposes the application to timing attacks where an attacker could deduce the secret token character-by-character by measuring response times.
**Prevention:** To prevent timing attacks when comparing sensitive strings like API tokens or secrets, always use Node's `crypto.timingSafeEqual` with `Buffer.from()` instead of standard string equality (`===`), ensuring you verify both buffer lengths match before comparison to prevent thrown errors.
