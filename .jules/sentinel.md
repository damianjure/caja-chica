## 2024-06-10 - Stop Leaking Internal Supabase Errors to Client
**Vulnerability:** Internal Supabase database errors (`error.message`) were being sent directly to the client in HTTP 500 responses across multiple API routes (e.g., `src/server/routes/me.ts` and `src/server/routes/dashboard.ts`).
**Learning:** Returning raw database error messages exposes internal infrastructure details, schemas, and potential query structures, violating the "fail securely" principle.
**Prevention:** Always catch and log internal errors on the server, but return generic, sanitized error messages (e.g., `"internal_error"`) to the client when a 500 error occurs.

## 2024-06-24 - Stop Leaking Invite Tokens to Dashboard Members
**Vulnerability:** The `/api/personas` endpoint was exposing the `invite_url` (which contains a sensitive `invite_token`) for all dashboard invitations to any member with view access to the dashboard.
**Learning:** Returning sensitive tokens allows attackers with read-only access to hijack invitations intended for other users by using the token to accept the invite.
**Prevention:** Always filter out sensitive fields (like tokens or internal URLs) at the application level based on the caller's session role (e.g. superadmin) and resource ownership (e.g. `invited_by_user_id === session.userId`).
