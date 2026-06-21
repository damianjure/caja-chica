## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-25 - Prevent Timing Attacks on Admin Tokens
**Vulnerability:** The API used a standard string equality operator (`===`) to verify the `X-Admin-Token` header, which is susceptible to timing attacks. An attacker could potentially infer the secret token by measuring the time taken to reject invalid tokens, as standard equality checks return false at the first mismatched character.
**Learning:** Comparing security-critical strings (like passwords, API keys, or secret tokens) using `===` introduces timing vulnerabilities.
**Prevention:** Always use Node.js's `crypto.timingSafeEqual` along with `Buffer.from()` to compare sensitive strings. Ensure that the strings are padded or checked for equal length before calling `timingSafeEqual` to avoid errors.
