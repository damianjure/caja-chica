## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-27 - Prevent Timing Attacks in Token Verification
**Vulnerability:** The API token verification in \`src/server/app.ts\` compared strings directly instead of using \`timingSafeEqual\`.
**Learning:** Comparing sensitive strings directly can lead to timing attacks, where an attacker can determine the expected token by measuring the time it takes to compare the token byte by byte.
**Prevention:** Always use Node's \`crypto.timingSafeEqual\` with \`Buffer.from()\` to compare sensitive strings like API tokens. Verify that both buffer lengths match before comparison to prevent thrown errors.
