## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-25 - Fix timing attack vulnerability in admin token validation
**Vulnerability:** The `hasValidAdminToken` function in `src/server/app.ts` was using a strict equality (`===`) comparison to validate the `X-Admin-Token` header.
**Learning:** Comparing sensitive strings like API tokens or secrets using standard string equality allows attackers to perform timing attacks by measuring the time it takes for the comparison to fail.
**Prevention:** Always use Node's `crypto.timingSafeEqual` with `Buffer.from()` instead of standard string equality (`===`) when comparing sensitive strings. Ensure you verify both buffer lengths match before comparison to prevent thrown errors.
