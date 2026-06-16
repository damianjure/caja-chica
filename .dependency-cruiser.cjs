/**
 * Architecture guard. The frontend (React) shares the `src/` tree with the
 * server, bot and channel adapters, and nothing else stops a component from
 * importing server-only code (Supabase admin, Drive, Gemini, secrets) — which
 * would leak into the client bundle or break the build. This rule enforces the
 * boundary at lint/CI time. Only runtime imports count; `import type` is erased
 * by the compiler, so type-sharing across the line is allowed.
 *
 * Run: npm run lint:arch
 */
module.exports = {
  forbidden: [
    {
      name: 'no-client-to-server',
      severity: 'error',
      comment: 'El frontend no puede importar código de servidor/bot/flows/channels (fuga de secretos + rompe el bundle).',
      from: { path: '^src/', pathNot: '^src/(server|bot|flows|channels)/' },
      to: { path: '^src/(server|bot|flows|channels)/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Dependencia circular: dificulta el razonamiento y rompe el orden de inicialización.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Runtime deps only — `import type` is erased, so it isn't a boundary leak.
    tsPreCompilationDeps: false,
  },
};
