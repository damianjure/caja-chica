## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2025-02-28 - Prevent Timing Attacks in Admin API Token Comparison
**Vulnerability:** The `hasValidAdminToken` middleware compared the client-supplied `X-Admin-Token` string against the expected `adminApiToken` environment variable using strict equality (`===`).
**Learning:** Using standard string equality allows an attacker to perform a timing attack because V8 (and most string comparators) abort the comparison as soon as a mismatch is found. This leaks information about the correct prefix of the token, allowing an attacker to guess the secret over time.
**Prevention:** Always use `crypto.timingSafeEqual` with `Buffer.from()` to compare secrets, and ensure both buffers have identical lengths before performing the comparison (to prevent `timingSafeEqual` from throwing).
