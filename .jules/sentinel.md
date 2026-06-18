## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.
## 2025-02-28 - [CRITICAL] Prevent Timing Attacks on API Tokens
**Vulnerability:** Comparing sensitive strings like API tokens (`X-Admin-Token` against `adminApiToken`) using standard string equality operators (`===`).
**Learning:** Standard string comparisons can exit early when a character mismatch occurs. This allows attackers to measure the time taken for the comparison and sequentially guess the correct token character by character.
**Prevention:** Always use Node's `crypto.timingSafeEqual` with `Buffer.from()` instead of standard string equality (`===`) for comparing security-sensitive strings. It takes a constant amount of time regardless of how many characters match. Length checks should precede it.
