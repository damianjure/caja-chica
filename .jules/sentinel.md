## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-11 - Prevent Timing Attacks in API Token Validation
**Vulnerability:** The API token comparison in `hasValidAdminToken` (in `src/server/app.ts`) used a standard strict equality (`===`), which is susceptible to timing attacks. An attacker could measure the time taken to reject a token to guess the correct `adminApiToken` character by character.
**Learning:** Standard string comparisons should never be used for sensitive tokens or secrets because their execution time depends on the length of the matching prefix.
**Prevention:** Always use Node's `crypto.timingSafeEqual` with `Buffer.from()` after first verifying that both strings have the same length. This guarantees constant-time comparison, preventing timing-based secret extraction.
