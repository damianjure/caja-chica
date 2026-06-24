## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2025-02-27 - Prevent Timing Attacks in Token Verification
**Vulnerability:** Comparing sensitive tokens (`adminApiToken`) using standard string equality (`===`) in `hasValidAdminToken`.
**Learning:** Standard string equality checks return `false` at the first mismatched character, allowing an attacker to deduce the token character by character based on the time it takes the server to respond.
**Prevention:** Always use Node's `crypto.timingSafeEqual` with `Buffer.from()` (and verify buffer lengths first) when comparing sensitive strings like API tokens or secrets.
