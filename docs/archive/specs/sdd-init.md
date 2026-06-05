# SDD Init: caja-chica

## Project Context
- **Project**: caja-chica (in `Boteado` directory)
- **Stack**: React 19, Vite 6, Tailwind CSS v4, Express, TypeScript, Supabase, grammY, `@google/genai`
- **Architecture**: React frontend (dashboard), Express backend (API + Telegram Bot), Supabase for auth/data, Google Drive integration.
- **Persistence Mode**: Hybrid (Engram + OpenSpec)

## Testing Capabilities

**Strict TDD Mode**: enabled
**Detected**: 2026-05-19

### Test Runner
- Command: `node --import tsx --test tests/**/*.test.ts`
- Framework: Node.js native test runner

### Test Layers
| Layer       | Available | Tool        |
| ----------- | --------- | ----------- |
| Unit        | ✅        | node:test   |
| Integration | ✅        | node:test   |
| E2E         | ❌        | —           |

### Coverage
- Available: ❌
- Command: —

### Quality Tools
| Tool         | Available | Command        |
| ------------ | --------- | -------------- |
| Linter       | ❌        | —              |
| Type checker | ✅        | `tsc --noEmit` |
| Formatter    | ❌        | —              |
