## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-23 - Prevent Timing Attacks in Token Comparison
**Vulnerability:** The application was using standard string equality (`===`) to compare the `adminApiToken` with the provided `X-Admin-Token` header in `src/server/app.ts`. This allows an attacker to potentially deduce the correct token by measuring the time the server takes to reject invalid tokens, as `===` exits early upon the first mismatched character.
**Learning:** For comparing sensitive tokens, secrets, or passwords, a constant-time comparison is necessary.
**Prevention:** Always use `crypto.timingSafeEqual()` for comparing sensitive tokens. Ensure both inputs are converted to Buffers and verify their lengths match before comparison, as `timingSafeEqual` will throw an error if lengths differ.
