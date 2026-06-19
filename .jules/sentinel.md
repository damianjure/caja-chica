## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-17 - Prevent Timing Attacks in Token Validation
**Vulnerability:** The API used direct string comparison (`===`) to validate the `X-Admin-Token` against the `adminApiToken` environment variable in `hasValidAdminToken` (`src/server/app.ts`). This allows an attacker to observe the time taken for the comparison and progressively guess the admin token character by character.
**Learning:** String comparisons in V8 exit early as soon as a mismatch is found. For security tokens and sensitive API keys, this small timing difference can be exploited over thousands of requests.
**Prevention:** Always use `crypto.timingSafeEqual` with `Buffer.from()` when comparing security tokens, API keys, webhook secrets, or passwords to ensure constant-time comparison, even if the strings do not match.
