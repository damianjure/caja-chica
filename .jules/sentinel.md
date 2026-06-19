## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-11 - Timing Attack Vulnerability in Token Comparison
**Vulnerability:** The application used standard string equality (`===`) to compare the incoming `X-Admin-Token` with the configured `adminApiToken` (`req.header("X-Admin-Token") === adminApiToken`). Standard string comparison stops at the first mismatched character, allowing an attacker to deduce the token length and contents character by character based on the time it takes the server to respond (timing attack).
**Learning:** Sensitive values, such as API tokens, secrets, or passwords, must never be compared using short-circuiting equality operators (`===` or `==`). Doing so leaves the system open to timing attacks where the time complexity of the string comparison reveals the secret itself.
**Prevention:** Always compare sensitive strings using a constant-time comparison algorithm. In Node.js, use `crypto.timingSafeEqual` along with `Buffer.from()` to securely compare the two strings.
